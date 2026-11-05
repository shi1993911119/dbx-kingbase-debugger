// Fixed-service Windows Credential Manager helper. JSON enters via stdin only.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"regexp"
	"runtime"
	"syscall"
	"unsafe"
)

const prefix = "DBX-KB-1\n"
const service = "local.kingbase.debugger.database-password/"
const notFound = 1168

type credential struct {
	Flags, Type             uint32
	TargetName, Comment     *uint16
	LastWritten             syscall.Filetime
	BlobSize                uint32
	Blob                    *byte
	Persist, AttributeCount uint32
	Attributes              unsafe.Pointer
	TargetAlias, UserName   *uint16
}
type request struct {
	Operation string  `json:"operation"`
	Account   string  `json:"account"`
	Password  *string `json:"password"`
}

var validAccount = regexp.MustCompile(`^private-[a-f0-9-]{36}:[a-f0-9]{64}$`)
var advapi = syscall.NewLazyDLL("advapi32.dll")
var read = advapi.NewProc("CredReadW")
var write = advapi.NewProc("CredWriteW")
var remove = advapi.NewProc("CredDeleteW")
var free = advapi.NewProc("CredFree")

func main() {
	reply := handle()
	_ = json.NewEncoder(os.Stdout).Encode(reply)
}
func status(err error) map[string]any {
	code := uint32(13)
	if value, ok := err.(syscall.Errno); ok {
		code = uint32(value)
	}
	return map[string]any{"ok": false, "status": code}
}
func handle() map[string]any {
	input, err := io.ReadAll(io.LimitReader(os.Stdin, 128*1024+1))
	if err != nil || len(input) > 128*1024 {
		return status(syscall.EINVAL)
	}
	defer clear(input)
	var req request
	decoder := json.NewDecoder(bytes.NewReader(input))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&req) != nil || !validAccount.MatchString(req.Account) {
		return status(syscall.EINVAL)
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return status(syscall.EINVAL)
	}
	target, _ := syscall.UTF16PtrFromString(service + req.Account)
	switch req.Operation {
	case "has", "get":
		var ptr *credential
		ok, _, e := read.Call(uintptr(unsafe.Pointer(target)), 1, 0, uintptr(unsafe.Pointer(&ptr)))
		runtime.KeepAlive(target)
		if ok == 0 {
			if e == syscall.Errno(notFound) {
				return map[string]any{"ok": true, "found": false}
			}
			return status(e)
		}
		if ptr == nil {
			return status(syscall.EINVAL)
		}
		defer free.Call(uintptr(unsafe.Pointer(ptr)))
		if ptr.BlobSize > 2560 || ptr.Blob == nil {
			return status(syscall.EINVAL)
		}
		blob := unsafe.Slice(ptr.Blob, int(ptr.BlobSize))
		defer clear(blob)
		result := map[string]any{"ok": true, "found": true}
		if req.Operation == "get" {
			if !bytes.HasPrefix(blob, []byte(prefix)) {
				return status(syscall.Errno(13))
			}
			result["password"] = string(blob[len(prefix):])
		}
		return result
	case "set":
		if req.Password == nil {
			return status(syscall.EINVAL)
		}
		blob := []byte(prefix + *req.Password)
		defer clear(blob)
		// Credential Manager's documented maximum is 2560 bytes, including our envelope.
		if len(blob) > 2560 {
			return map[string]any{"ok": false, "status": 24}
		}
		comment, _ := syscall.UTF16PtrFromString("DBX 金仓调试 · 数据库密码")
		user, _ := syscall.UTF16PtrFromString("DBX Kingbase Debugger")
		value := credential{Type: 1, TargetName: target, Comment: comment, BlobSize: uint32(len(blob)), Blob: &blob[0], Persist: 2, UserName: user}
		ok, _, e := write.Call(uintptr(unsafe.Pointer(&value)), 0)
		runtime.KeepAlive(value)
		runtime.KeepAlive(blob)
		runtime.KeepAlive(target)
		runtime.KeepAlive(comment)
		runtime.KeepAlive(user)
		if ok == 0 {
			return status(e)
		}
	case "delete":
		ok, _, e := remove.Call(uintptr(unsafe.Pointer(target)), 1, 0)
		runtime.KeepAlive(target)
		if ok == 0 && e != syscall.Errno(notFound) {
			return status(e)
		}
	default:
		return status(syscall.EINVAL)
	}
	return map[string]any{"ok": true, "status": 0}
}
