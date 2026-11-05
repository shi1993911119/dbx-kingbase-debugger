package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

const javaExecutable = "java.exe"

func executableFile(info os.FileInfo) bool { return info.Mode().IsRegular() }
func configureCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
func platformJavaCandidates() []string {
	var paths []string
	for _, base := range []string{os.Getenv("ProgramW6432"), os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")} {
		if base == "" {
			continue
		}
		for _, pattern := range []string{"Java/*/bin/java.exe", "Eclipse Adoptium/*/bin/java.exe", "Microsoft/jdk-*/bin/java.exe", "Amazon Corretto/*/bin/java.exe", "Zulu/*/bin/java.exe", "BellSoft/*/bin/java.exe", "DBeaver/jre/bin/java.exe", "DBeaver/jre/Contents/Home/bin/java.exe", "Programs/Eclipse Adoptium/*/bin/java.exe", "Programs/DBeaver/jre/bin/java.exe"} {
			found, _ := filepath.Glob(filepath.Join(base, filepath.FromSlash(pattern)))
			paths = append(paths, found...)
		}
	}
	return paths
}

// Assign this launcher to a private, non-inheritable kill-on-close job before
// creating children. Windows inherits job membership into Java and its helper.
// The OS closes the only job handle when DBX terminates this launcher, including
// forced termination; no Java/database process is left behind.
var processJob syscall.Handle

func prepareProcessTree() error {
	kernel := syscall.NewLazyDLL("kernel32.dll")
	create := kernel.NewProc("CreateJobObjectW")
	set := kernel.NewProc("SetInformationJobObject")
	assign := kernel.NewProc("AssignProcessToJobObject")
	h, _, err := create.Call(0, 0)
	if h == 0 {
		return fmt.Errorf("create Java process job: %w", err)
	}
	type basicLimits struct {
		ProcessTime, JobTime         int64
		Flags                        uint32
		MinWorkingSet, MaxWorkingSet uintptr
		ActiveProcesses              uint32
		Affinity                     uintptr
		Priority, Scheduling         uint32
	}
	type ioCounters struct{ ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes uint64 }
	type extendedLimits struct {
		Basic                                                      basicLimits
		IO                                                         ioCounters
		ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory uintptr
	}
	limits := extendedLimits{}
	limits.Basic.Flags = 0x2000 // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	ok, _, err := set.Call(h, 9, uintptr(unsafe.Pointer(&limits)), unsafe.Sizeof(limits))
	if ok == 0 {
		syscall.CloseHandle(syscall.Handle(h))
		return fmt.Errorf("set Java process job limits: %w", err)
	}
	current, e := syscall.GetCurrentProcess()
	if e != nil {
		syscall.CloseHandle(syscall.Handle(h))
		return e
	}
	ok, _, err = assign.Call(h, uintptr(current))
	if ok == 0 {
		syscall.CloseHandle(syscall.Handle(h))
		return fmt.Errorf("assign Java process job: %w", err)
	}
	// Do not close while alive: that would also terminate this launcher.
	processJob = syscall.Handle(h)
	return nil
}
func runJava(path string, args []string) error {
	cmd := exec.Command(path, args...)
	configureCommand(cmd)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if exit, ok := err.(*exec.ExitError); ok {
		os.Exit(exit.ExitCode())
	}
	return err
}
