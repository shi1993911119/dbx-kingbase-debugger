"""Exercise only a fresh synthetic item; never list/read an existing user's credential."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import uuid

helper = Path(os.environ.get("DBX_TEST_RUNTIME_ROOT", Path(__file__).resolve().parents[1])) / "lib/keychain-helper"
account = "private-" + str(uuid.uuid4()) + ":" + hashlib.sha256(b"dbx-synthetic-keychain-test").hexdigest()


def call(operation, **values):
    payload = dict(operation=operation, account=account, **values)
    result = subprocess.run([str(helper)], input=json.dumps(payload).encode(), stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, timeout=100, check=True)
    reply = json.loads(result.stdout)
    assert reply.get("ok"), "Keychain test operation failed (status %s)" % reply.get("status")
    return reply


assert not call("has")["found"]
created = False
try:
    synthetic = "Synthetic only 中文 ' \" \\ \n $(inert) `inert` " + str(uuid.uuid4())
    call("set", password=synthetic)
    created = True
    assert call("has")["found"]
    assert "password" not in call("has")
    assert call("get")["password"] == synthetic
    call("set", password="replacement")
    assert call("get")["password"] == "replacement"
    call("set", password="")
    assert call("get")["password"] == ""
finally:
    if created:
        call("delete")
assert not call("get")["found"]
call("delete")
print("PASS: native macOS Keychain synthetic-only create/presence/read/update/empty/delete; no secret printed; test item removed")
