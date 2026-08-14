package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

func main() {
	if len(os.Args) < 2 || (os.Args[1] != "promote" && os.Args[1] != "demote") {
		log.Fatal("usage: figcolor-admin <promote|demote> --email user@example.com")
	}
	command := os.Args[1]
	flags := flag.NewFlagSet(command, flag.ExitOnError)
	email := flags.String("email", "", "account email")
	_ = flags.Parse(os.Args[2:])
	*email = strings.ToLower(strings.TrimSpace(*email))
	if *email == "" {
		log.Fatal("--email is required")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://localhost:5432/figcolor?sslmode=disable"
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err = changeRole(db, command, *email); err != nil {
		log.Fatal(err)
	}
}

func changeRole(db *sql.DB, command, email string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id, storedEmail, role string
	var verified bool
	err = tx.QueryRow(`SELECT id,email,role,email_verified_at IS NOT NULL FROM users WHERE LOWER(email)=LOWER($1) FOR UPDATE`, email).Scan(&id, &storedEmail, &role, &verified)
	if err == sql.ErrNoRows {
		return fmt.Errorf("account not found")
	}
	if err != nil {
		return err
	}
	target := "admin"
	event := "admin_promoted"
	if command == "promote" && !verified {
		return fmt.Errorf("account must verify email before promotion")
	}
	if command == "demote" {
		target = "user"
		event = "admin_demoted"
		if role == "admin" {
			var count int
			if err = tx.QueryRow(`SELECT COUNT(*) FROM users WHERE role='admin'`).Scan(&count); err != nil {
				return err
			}
			if count <= 1 {
				return fmt.Errorf("cannot demote the last admin")
			}
		}
	}
	if role == target {
		fmt.Printf("id=%s email=%s result=already_%s\n", id, storedEmail, target)
		return tx.Commit()
	}
	if _, err = tx.Exec(`UPDATE users SET role=$1,auth_version=auth_version+1,updated_at=NOW() WHERE id=$2`, target, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO auth_audit_events(user_id,event_type,actor,metadata) VALUES($1,$2,$3,'{}')`, id, event, "figcolor-admin"); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	fmt.Printf("id=%s email=%s result=%sd\n", id, storedEmail, command)
	return nil
}
