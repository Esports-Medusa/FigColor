package main

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), 12)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Println("Hash:", string(hash))
	
	// Verify
	err = bcrypt.CompareHashAndPassword(hash, []byte("admin123"))
	fmt.Println("Verify:", err == nil)
}