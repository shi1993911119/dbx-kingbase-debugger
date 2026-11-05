"""Verify final unsigned candidates, including nested Java archives, without a database."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = json.loads((ROOT / 'manifest.json').read_text())
TARGETS = ('darwin-arm64', 'windows-x64')
GSON_SHA256 = '2cbd119bf1961c28788310963dc80ba65f58cdeec1dd139c8bdb1240faa2c36f'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def architecture(data, target):
    if target == 'windows-x64':
        assert data[:2] == b'MZ', 'Expected Windows executable'
        offset = struct.unpack_from('<I', data, 60)[0]
        assert data[offset:offset+4] == b'PE\0\0'
        assert struct.unpack_from('<H', data, offset+4)[0] == 0x8664, 'Expected AMD64'
    else:
        assert data[:4] == b'\xcf\xfa\xed\xfe', 'Expected Mach-O 64-bit'
        assert struct.unpack_from('<I', data, 4)[0] == 0x100000C, 'Expected Apple ARM64'


def check_text(name, data):
    assert b'-----BEGIN PRIVATE KEY-----' not in data, 'Private key found: ' + name
    assert not re.search(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})', data), 'Token found: ' + name
    if name.endswith(('.js', '.html', '.css', '.json', '.svg')):
        assert b'/Users/' not in data and b'C:\\Users\\' not in data, 'Local home path: ' + name
        for raw in re.findall(rb'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])', data):
            parts = [int(p) for p in raw.split(b'.')]
            assert not (parts[0] == 10 or parts[:2] == [192, 168] or (parts[0] == 172 and 16 <= parts[1] <= 31)), 'Private network address: ' + name


def verify(file, extract_to=None):
    with zipfile.ZipFile(file) as z:
        names = z.namelist()
        assert len(set(names)) == len(names), 'Duplicate archive entry'
        files = {n for n in names if not n.endswith('/')}
        for info in z.infolist():
            p = PurePosixPath(info.filename)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in info.filename
            assert not stat.S_ISLNK(info.external_attr >> 16), 'Symlink in archive'
            assert info.file_size <= 64 * 1024 * 1024
        assert 'signature.json' not in files, 'Candidate must be unsigned'
        checksums = json.loads(z.read('checksums.json'))
        assert checksums['algorithm'] == 'sha256'
        assert set(checksums['files']) == files - {'checksums.json'}, 'Checksum coverage mismatch'
        for name, digest in checksums['files'].items():
            data = z.read(name)
            assert sha(data) == digest, 'Checksum mismatch: ' + name
            check_text(name, data)
        manifest = json.loads(z.read('manifest.json'))
        for key in ('id', 'publisher', 'version', 'permissions', 'engines', 'contributions', 'source', 'homepage'):
            assert manifest[key] == EXPECTED[key], 'Manifest mismatch: ' + key
        target = next((t for t in TARGETS if file.name == EXPECTED['id'] + '-' + EXPECTED['version'] + '-' + t + '.dbxp'), None)
        assert target, 'Unexpected package filename: ' + file.name
        executable = 'bin/' + target + '/dbx-kingbase-debugger' + ('.exe' if target == 'windows-x64' else '')
        assert manifest['entrypoints']['backend']['executable'] == executable
        architecture(z.read(executable), target)
        helper = 'lib/credential-helper.exe' if target == 'windows-x64' else 'lib/keychain-helper'
        architecture(z.read(helper), target)
        expected_files = {'manifest.json', 'checksums.json', executable, helper, 'lib/gson.jar', 'lib/kingbase-debugger.jar', 'lib/GSON-LICENSE.txt', 'lib/GO-LICENSE.txt', 'LICENSE', 'THIRD-PARTY.md'}
        for directory in ('ui', 'assets'):
            for path in (ROOT / directory).rglob('*'):
                if path.is_file():
                    name = path.relative_to(ROOT).as_posix()
                    expected_files.add(name)
                    assert z.read(name) == path.read_bytes(), 'Stale source asset: ' + name
        assert files == expected_files, 'Unexpected package files: ' + str(files ^ expected_files)
        for name in ('LICENSE', 'THIRD-PARTY.md', 'lib/GSON-LICENSE.txt', 'lib/GO-LICENSE.txt'):
            assert z.read(name) == (ROOT / name).read_bytes(), 'License mismatch: ' + name
        assert sha(z.read('lib/gson.jar')) == GSON_SHA256, 'Gson provenance mismatch'
        with zipfile.ZipFile(io.BytesIO(z.read('lib/kingbase-debugger.jar'))) as jar:
            classes = [n for n in jar.namelist() if n.endswith('.class')]
            assert classes and all(n.startswith('local/dbx/kingbase/') for n in classes), 'Unexpected Java classes'
            for name in classes:
                data = jar.read(name)
                assert data[:4] == b'\xca\xfe\xba\xbe' and struct.unpack_from('>H', data, 6)[0] == 55, 'Java 11 bytecode required'
                check_text(name, data)
            main = jar.read('local/dbx/kingbase/Main.class')
            assert EXPECTED['id'].encode() in main and EXPECTED['version'].encode() in main, 'Stale backend identity'
        metadata_file = file.with_suffix('.artifact.json')
        metadata = json.loads(metadata_file.read_text())
        assert metadata['sha256'] == sha(file.read_bytes()) and metadata['size'] == file.stat().st_size
        assert metadata['target'] == target
        assert 'signingKeyId' not in metadata, 'Unsigned metadata must not declare a signer'
        if extract_to:
            destination = Path(extract_to) / target
            destination.mkdir(parents=True, exist_ok=False)
            z.extractall(destination)
            for name in (executable, helper):
                (destination / name).chmod(0o755)
        print('PASS:', file.name, 'identity, current UI, full checksums, architecture, Java 11, licenses, unsigned, file allowlist, credential scan')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packages', nargs='*', type=Path)
    parser.add_argument('--extract-to', type=Path)
    args = parser.parse_args()
    packages = args.packages or [ROOT / 'dist' / (EXPECTED['id'] + '-' + EXPECTED['version'] + '-' + t + '.dbxp') for t in TARGETS]
    for package in packages:
        verify(package, args.extract_to)
