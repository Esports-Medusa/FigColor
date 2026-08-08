package main

import (
	"flag"
	"fmt"
	"github.com/qiqi/figcolor/backend/internal/feasibility/realpilot"
	"os"
)

func usage() { fmt.Fprintln(os.Stderr, "usage: realfigurepilot <prepare|run> [options]") }
func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "prepare":
		prepare(os.Args[2:])
	case "run":
		run(os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
}
func prepare(args []string) {
	fs := flag.NewFlagSet("prepare", flag.ExitOnError)
	root := fs.String("input-root", "", "approved local input root")
	manifest := fs.String("manifest", "", "new manifest draft path")
	pilotID := fs.String("pilot-id", "real-scientific-figure-pilot", "stable pilot ID")
	_ = fs.Parse(args)
	if *root == "" || *manifest == "" {
		fmt.Fprintln(os.Stderr, "input-root and manifest are required")
		os.Exit(2)
	}
	m, err := realpilot.PrepareManifest(*root, *pilotID)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err = realpilot.WriteManifest(*manifest, m); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("prepared_manifest fixtures=%d path=%s\n", len(m.Fixtures), *manifest)
}
func run(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	manifest := fs.String("manifest", "", "pilot manifest JSON")
	root := fs.String("input-root", "", "approved local input root")
	output := fs.String("output", "", "machine-readable result path")
	_ = fs.Parse(args)
	if *manifest == "" || *root == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "manifest, input-root and output are required")
		os.Exit(2)
	}
	m, err := realpilot.Load(*manifest)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	s := realpilot.Run(m, *root)
	if err = realpilot.WriteSummary(*output, s); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(s.Status)
}
