package main

import (
	"flag"
	"fmt"
	"github.com/qiqi/figcolor/backend/internal/feasibility/realpilot"
	"os"
)

func main() {
	manifest := flag.String("manifest", "", "pilot manifest JSON")
	root := flag.String("input-root", "", "approved local input root")
	output := flag.String("output", "", "machine-readable result path")
	flag.Parse()
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
	if err := realpilot.WriteSummary(*output, s); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(s.Status)
}
