// The native entrypoint lets the official DBX CLI package a JDBC sidecar.
// Platform files handle process lifetime without changing the JSON-RPC stream.
package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"time"
)

func main() {
	executable, err := os.Executable()
	if err != nil {
		fail(err)
	}
	root := filepath.Dir(filepath.Dir(filepath.Dir(executable)))
	// Establish child cleanup before starting even a java -version probe.
	if err := prepareProcessTree(); err != nil {
		fail(err)
	}
	candidates := []string{os.Getenv("DBX_KINGBASE_JAVA")}
	if home := os.Getenv("JAVA_HOME"); home != "" {
		candidates = append(candidates, filepath.Join(home, "bin", javaExecutable))
	}
	candidates = append(candidates, platformJavaCandidates()...)
	if path, err := exec.LookPath(javaExecutable); err == nil {
		candidates = append(candidates, path)
	}
	for _, path := range candidates {
		if !filepath.IsAbs(path) {
			continue
		}
		st, err := os.Stat(path)
		if err != nil || st.IsDir() || !executableFile(st) {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		probe := exec.CommandContext(ctx, path, "-version")
		configureCommand(probe)
		output, err := probe.CombinedOutput()
		cancel()
		if err != nil || javaMajor(string(output)) < 11 {
			continue
		}
		args := []string{"-Dfile.encoding=UTF-8", "-cp", filepath.Join(root, "lib", "kingbase-debugger.jar") + string(os.PathListSeparator) + filepath.Join(root, "lib", "gson.jar"), "local.dbx.kingbase.Main"}
		if err := runJava(path, args); err != nil {
			fail(err)
		}
		return
	}
	fail(fmt.Errorf("Java 11+ not found; install a JDK or set DBX_KINGBASE_JAVA to an absolute java executable"))
}

var versionPattern = regexp.MustCompile(`(?:version\s+"|openjdk\s+)([0-9]+)(?:\.([0-9]+))?`)

func javaMajor(output string) int {
	parts := versionPattern.FindStringSubmatch(output)
	if len(parts) == 0 {
		return 0
	}
	major, _ := strconv.Atoi(parts[1])
	if major == 1 {
		major, _ = strconv.Atoi(parts[2])
	}
	return major
}
func fail(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
