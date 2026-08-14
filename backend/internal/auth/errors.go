package auth

import "errors"

type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func authError(code, message string) error { return &Error{Code: code, Message: message} }

func asAuthError(err error) (*Error, bool) {
	var target *Error
	return target, errors.As(err, &target)
}
