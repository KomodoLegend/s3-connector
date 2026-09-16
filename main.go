package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/alexey-stepanov/s3-connector/internal/config"
	"github.com/alexey-stepanov/s3-connector/internal/server"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "HTTP listen address")
	storePath := flag.String("store", "", "path to connections JSON (default: ~/.config/s3-connector/connections.json)")
	noOpen := flag.Bool("no-open", false, "do not open browser on start")
	flag.Parse()

	path := *storePath
	if path == "" {
		var err error
		path, err = config.DefaultPath()
		if err != nil {
			log.Fatalf("config path: %v", err)
		}
	}

	store, err := config.Open(path)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}

	srv := server.New(store)
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	url := "http://" + ln.Addr().String()
	fmt.Printf("S3 Connector\n  UI:    %s\n  Store: %s\n", url, store.Path())

	if !*noOpen {
		go func() {
			time.Sleep(300 * time.Millisecond)
			_ = openBrowser(url)
		}()
	}

	if err := http.Serve(ln, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}

func openBrowser(url string) error {
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
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Start()
}
