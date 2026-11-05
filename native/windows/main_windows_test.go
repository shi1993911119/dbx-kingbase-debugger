package main

import (
	"testing"
	"unsafe"
)

func TestCredentialLayoutAMD64(t *testing.T) {
	if unsafe.Sizeof(uintptr(0)) != 8 {
		t.Skip("Windows x64 release layout")
	}
	var c credential
	if unsafe.Sizeof(c) != 80 || unsafe.Offsetof(c.BlobSize) != 32 || unsafe.Offsetof(c.Blob) != 40 || unsafe.Offsetof(c.Persist) != 48 || unsafe.Offsetof(c.Attributes) != 56 || unsafe.Offsetof(c.UserName) != 72 {
		t.Fatal("CREDENTIALW layout does not match the Windows x64 ABI")
	}
}
