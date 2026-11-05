//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

const javaExecutable = "java"

func prepareProcessTree() error            { return nil }
func executableFile(info os.FileInfo) bool { return info.Mode()&0111 != 0 }
func configureCommand(cmd *exec.Cmd)       {}
func platformJavaCandidates() []string {
	found, _ := filepath.Glob("/Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java")
	return append(found, "/Applications/DBeaver.app/Contents/Eclipse/jre/Contents/Home/bin/java", "/opt/homebrew/opt/openjdk/bin/java", "/usr/local/opt/openjdk/bin/java")
}
func runJava(path string, args []string) error {
	return syscall.Exec(path, append([]string{path}, args...), os.Environ())
}
