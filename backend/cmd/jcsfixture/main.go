package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	"github.com/qiqi/figcolor/backend/internal/jcs"
)

type response struct {
	Canonical string `json:"canonical,omitempty"`
	Hash      string `json:"hash,omitempty"`
	Error     string `json:"error,omitempty"`
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)
	for scanner.Scan() {
		canonical, hash, err := jcs.Hash(scanner.Bytes())
		result := response{Canonical: string(canonical), Hash: hash}
		if err != nil {
			result = response{Error: "invalid_rfc8785_json"}
		}
		if encodeErr := encoder.Encode(result); encodeErr != nil {
			fmt.Fprintln(os.Stderr, encodeErr)
			os.Exit(1)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
