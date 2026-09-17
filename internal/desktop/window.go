package desktop

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// OpenAppWindow launches a dedicated app window (no browser chrome when possible)
// and returns the running command so the caller can Wait() for window close.
func OpenAppWindow(url, userDataDir string) (*exec.Cmd, error) {
	if err := os.MkdirAll(userDataDir, 0o700); err != nil {
		return nil, err
	}

	switch runtime.GOOS {
	case "linux":
		return openLinux(url, userDataDir)
	case "darwin":
		cmd := exec.Command("open", "-n", "-a", "Google Chrome", "--args", "--app="+url, "--user-data-dir="+userDataDir)
		return start(cmd)
	case "windows":
		chrome := filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe")
		if _, err := os.Stat(chrome); err != nil {
			chrome = filepath.Join(os.Getenv("LocalAppData"), "Google", "Chrome", "Application", "chrome.exe")
		}
		cmd := exec.Command(chrome, "--app="+url, "--user-data-dir="+userDataDir, "--no-first-run", "--class=s3-connector")
		return start(cmd)
	default:
		return nil, fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// OpenBrowser opens the UI in the default browser (tab).
func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported OS")
	}
	return cmd.Start()
}

func openLinux(url, userDataDir string) (*exec.Cmd, error) {
	type candidate struct {
		label string
		name  string
		args  []string
	}

	chromeFlags := func(dataDir string) []string {
		return []string{
			"--app=" + url,
			"--user-data-dir=" + dataDir,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-extensions",
			"--class=s3-connector",
			"--name=S3 Connector",
		}
	}

	chromeData := filepath.Join(userDataDir, "chromium")
	_ = os.MkdirAll(chromeData, 0o700)

	candidates := []candidate{
		{label: "google-chrome-stable", name: "google-chrome-stable", args: chromeFlags(chromeData)},
		{label: "google-chrome", name: "google-chrome", args: chromeFlags(chromeData)},
		{label: "chromium-browser", name: "chromium-browser", args: chromeFlags(chromeData)},
		{label: "chromium", name: "chromium", args: chromeFlags(chromeData)},
		{label: "brave-browser", name: "brave-browser", args: chromeFlags(chromeData)},
		{
			label: "flatpak:com.google.Chrome",
			name:  "flatpak",
			args: append([]string{
				"run",
				"--filesystem=" + chromeData + ":create",
				"com.google.Chrome",
			}, chromeFlags(chromeData)...),
		},
		{
			label: "flatpak:com.brave.Browser",
			name:  "flatpak",
			args: append([]string{
				"run",
				"--filesystem=" + chromeData + ":create",
				"com.brave.Browser",
			}, chromeFlags(chromeData)...),
		},
		// Last resort: separate Epiphany window (has minimal browser chrome).
		{
			label: "epiphany",
			name:  "epiphany",
			args:  []string{"--new-window", url},
		},
	}

	var errs []string
	for _, c := range candidates {
		path, err := exec.LookPath(c.name)
		if err != nil {
			continue
		}
		if c.name == "flatpak" {
			appID := flatpakAppID(c.args)
			if appID == "" || !flatpakAppInstalled(appID) {
				continue
			}
		}

		cmd := exec.Command(path, c.args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: start: %v", c.label, err))
			continue
		}

		time.Sleep(1200 * time.Millisecond)
		if !processAlive(cmd) {
			_ = cmd.Wait()
			errs = append(errs, fmt.Sprintf("%s: exited immediately", c.label))
			continue
		}
		return cmd, nil
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("no app window host worked: %s", strings.Join(errs, "; "))
	}
	return nil, fmt.Errorf("no Chromium/Chrome/Epiphany found for app window")
}

func processAlive(cmd *exec.Cmd) bool {
	if cmd.Process == nil {
		return false
	}
	// Signal 0 checks existence without killing.
	return cmd.Process.Signal(syscall.Signal(0)) == nil
}

func flatpakAppID(args []string) string {
	for _, a := range args {
		if a == "run" || strings.HasPrefix(a, "-") {
			continue
		}
		if strings.Contains(a, ".") {
			return a
		}
	}
	return ""
}

func flatpakAppInstalled(appID string) bool {
	cmd := exec.Command("flatpak", "info", appID)
	return cmd.Run() == nil
}

func start(cmd *exec.Cmd) (*exec.Cmd, error) {
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd, nil
}
