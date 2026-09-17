package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/alexey-stepanov/s3-connector/internal/config"
	"github.com/alexey-stepanov/s3-connector/internal/desktop"
	"github.com/alexey-stepanov/s3-connector/internal/server"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "HTTP listen address")
	storePath := flag.String("store", "", "path to connections JSON (default: ~/.config/s3-connector/connections.json)")
	noOpen := flag.Bool("no-open", false, "do not open UI window/browser")
	browser := flag.Bool("browser", false, "open in default browser instead of app window")
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

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		// Fall back to a free port if the default is busy.
		if *addr == "127.0.0.1:8787" {
			ln, err = net.Listen("tcp", "127.0.0.1:0")
		}
		if err != nil {
			log.Fatalf("listen: %v", err)
		}
	}

	srv := &http.Server{Handler: server.New(store).Handler()}
	url := "http://" + ln.Addr().String()
	fmt.Printf("S3 Connector\n  UI:    %s\n  Store: %s\n", url, store.Path())

	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	exitCh := make(chan error, 1)
	if !*noOpen {
		go func() {
			time.Sleep(200 * time.Millisecond)
			if *browser {
				exitCh <- desktop.OpenBrowser(url)
				return
			}
			profile := filepath.Join(filepath.Dir(store.Path()), "app-profile")
			cmd, err := desktop.OpenAppWindow(url, profile)
			if err != nil {
				log.Printf("app window unavailable (%v); falling back to browser", err)
				exitCh <- desktop.OpenBrowser(url)
				return
			}
			exitCh <- cmd.Wait()
		}()
	}

	select {
	case <-ctx.Done():
		// Ctrl+C / SIGTERM
	case err := <-exitCh:
		if err != nil && !*browser && !*noOpen {
			log.Printf("UI closed: %v", err)
		}
		// App window closed (or browser launch finished for -browser).
		// For -browser, keep serving until signal so the tab keeps working.
		if *browser || *noOpen {
			<-ctx.Done()
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
