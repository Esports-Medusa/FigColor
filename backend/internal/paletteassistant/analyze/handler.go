package analyze

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/imageanalysis"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/palettesuggestion"
)

type analyzeService interface {
	Analyze(context.Context, []byte, string) (paletteassistant.AnalyzeResponse, error)
}

type Handler struct{ service analyzeService }

func NewHandler(service analyzeService) (*Handler, error) {
	if service == nil {
		return nil, errors.New("analyze service is required")
	}
	return &Handler{service: service}, nil
}

func (h *Handler) RegisterRoutes(router *gin.RouterGroup, authMiddleware, adminMiddleware gin.HandlerFunc) {
	admin := router.Group("/admin")
	admin.Use(authMiddleware, adminMiddleware)
	admin.POST("/palette-assistant/analyze", h.Analyze)
}

func (h *Handler) Analyze(c *gin.Context) {
	encoded, declaredMIME, problem := readImage(c)
	if problem != nil {
		writeProblem(c, problem.Code)
		return
	}
	response, err := h.service.Analyze(c.Request.Context(), encoded, declaredMIME)
	encoded = nil
	if err != nil {
		writeProblem(c, problemCode(err))
		return
	}
	c.JSON(http.StatusOK, response)
}

func readImage(c *gin.Context) ([]byte, string, *paletteassistant.Problem) {
	contentType := c.GetHeader("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil || !strings.EqualFold(mediaType, "multipart/form-data") || len(params) != 1 || params["boundary"] == "" {
		return nil, "", newProblem(paletteassistant.ErrUnsupportedMediaType)
	}
	if c.Request.ContentLength > paletteassistant.MultipartBodyLimit {
		return nil, "", newProblem(paletteassistant.ErrRequestTooLarge)
	}
	bounded := http.MaxBytesReader(c.Writer, c.Request.Body, paletteassistant.MultipartBodyLimit)
	defer bounded.Close()
	rawBody, err := io.ReadAll(bounded)
	if errors.As(err, new(*http.MaxBytesError)) {
		return nil, "", newProblem(paletteassistant.ErrRequestTooLarge)
	}
	if err != nil {
		return nil, "", newProblem(paletteassistant.ErrMalformedRequest)
	}
	reader := multipart.NewReader(bytes.NewReader(rawBody), params["boundary"])
	part, err := reader.NextPart()
	if err == io.EOF {
		return nil, "", newProblem(paletteassistant.ErrMissingImage)
	}
	if err != nil {
		return nil, "", newProblem(paletteassistant.ErrMalformedRequest)
	}
	defer part.Close()
	if part.FormName() != paletteassistant.AnalyzeImageField {
		return nil, "", newProblem(paletteassistant.ErrMalformedRequest)
	}
	declaredMIME, ok := exactImageContentType(part.Header.Values("Content-Type"))
	if !ok {
		return nil, "", newProblem(paletteassistant.ErrUnsupportedMediaType)
	}
	encoded, err := io.ReadAll(io.LimitReader(part, paletteassistant.EncodedImageLimit+1))
	if err != nil {
		return nil, "", newProblem(paletteassistant.ErrMalformedRequest)
	}
	if len(encoded) == 0 {
		return nil, "", newProblem(paletteassistant.ErrMissingImage)
	}
	if int64(len(encoded)) > paletteassistant.EncodedImageLimit {
		return nil, "", newProblem(paletteassistant.ErrRequestTooLarge)
	}
	next, err := reader.NextPart()
	if err == nil {
		defer next.Close()
		if next.FormName() == paletteassistant.AnalyzeImageField {
			return nil, "", newProblem(paletteassistant.ErrMultipleImages)
		}
		return nil, "", newProblem(paletteassistant.ErrMalformedRequest)
	}
	if err != io.EOF {
		return nil, "", newProblem(paletteassistant.ErrMalformedRequest)
	}
	return encoded, declaredMIME, nil
}

func exactImageContentType(values []string) (string, bool) {
	if len(values) != 1 {
		return "", false
	}
	mediaType, params, err := mime.ParseMediaType(values[0])
	if err != nil || len(params) != 0 {
		return "", false
	}
	switch strings.ToLower(mediaType) {
	case "image/png":
		return "image/png", true
	case "image/jpeg":
		return "image/jpeg", true
	default:
		return "", false
	}
}

func problemCode(err error) paletteassistant.ProblemCode {
	if code, ok := imageanalysis.ErrorCodeOf(err); ok {
		switch code {
		case imageanalysis.ErrorEmptyInput:
			return paletteassistant.ErrMissingImage
		case imageanalysis.ErrorEncodedSizeExceeded:
			return paletteassistant.ErrRequestTooLarge
		case imageanalysis.ErrorUnsupportedMIME, imageanalysis.ErrorUnsupportedFormat:
			return paletteassistant.ErrUnsupportedMediaType
		case imageanalysis.ErrorSignatureMismatch:
			return paletteassistant.ErrImageSignatureMismatch
		case imageanalysis.ErrorDecodeFailed, imageanalysis.ErrorInvalidDimensions:
			return paletteassistant.ErrImageDecodeFailed
		case imageanalysis.ErrorWidthExceeded, imageanalysis.ErrorHeightExceeded:
			return paletteassistant.ErrImageDimensionsExceeded
		case imageanalysis.ErrorPixelLimitExceeded:
			return paletteassistant.ErrImagePixelLimitExceeded
		case imageanalysis.ErrorDeadlineExceeded:
			return paletteassistant.ErrAnalysisTimeout
		case imageanalysis.ErrorCapacityUnavailable:
			return paletteassistant.ErrAnalysisOverloaded
		case imageanalysis.ErrorCancelled:
			return paletteassistant.ErrRequestCancelled
		default:
			return paletteassistant.ErrInternalAnalysisFailure
		}
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, palettesuggestion.ErrCancelled) {
		return paletteassistant.ErrRequestCancelled
	}
	return paletteassistant.ErrInternalAnalysisFailure
}

func newProblem(code paletteassistant.ProblemCode) *paletteassistant.Problem {
	return &paletteassistant.Problem{Code: code, Message: problemMessage(code), Retryable: problemSpec(code).Retryable}
}

func writeProblem(c *gin.Context, code paletteassistant.ProblemCode) {
	spec := problemSpec(code)
	c.JSON(spec.HTTPStatus, newProblem(code))
}

func problemSpec(code paletteassistant.ProblemCode) paletteassistant.ProblemSpec {
	for _, spec := range paletteassistant.ProblemSpecs {
		if spec.Code == code && spec.Analyze {
			return spec
		}
	}
	for _, spec := range paletteassistant.ProblemSpecs {
		if spec.Code == paletteassistant.ErrInternalAnalysisFailure {
			return spec
		}
	}
	panic("missing internal analysis Problem spec")
}

func problemMessage(code paletteassistant.ProblemCode) string {
	messages := map[paletteassistant.ProblemCode]string{
		paletteassistant.ErrAuthenticationRequired:  "Sign in is required.",
		paletteassistant.ErrAdminRequired:           "Admin access is required.",
		paletteassistant.ErrMalformedRequest:        "The Analyze request is malformed.",
		paletteassistant.ErrMissingImage:            "Exactly one non-empty image is required.",
		paletteassistant.ErrMultipleImages:          "Exactly one image is required.",
		paletteassistant.ErrRequestTooLarge:         "The image request exceeds the allowed size.",
		paletteassistant.ErrUnsupportedMediaType:    "Only multipart PNG or JPEG image uploads are supported.",
		paletteassistant.ErrImageSignatureMismatch:  "The declared image type does not match the image bytes.",
		paletteassistant.ErrImageDecodeFailed:       "The image could not be decoded.",
		paletteassistant.ErrImageDimensionsExceeded: "The image dimensions exceed the allowed limit.",
		paletteassistant.ErrImagePixelLimitExceeded: "The image pixel count exceeds the allowed limit.",
		paletteassistant.ErrAnalysisTimeout:         "Image analysis timed out.",
		paletteassistant.ErrAnalysisOverloaded:      "Image analysis capacity is temporarily unavailable.",
		paletteassistant.ErrRequestCancelled:        "The request was cancelled.",
		paletteassistant.ErrInternalAnalysisFailure: "Image analysis failed safely.",
	}
	if message := messages[code]; message != "" {
		return message
	}
	return messages[paletteassistant.ErrInternalAnalysisFailure]
}
