package analyze

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
	"github.com/qiqi/figcolor/backend/internal/middleware"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/imageanalysis"
)

type stubAnalyzeService struct {
	response paletteassistant.AnalyzeResponse
	err      error
	encoded  []byte
	mime     string
	calls    int
}

func (s *stubAnalyzeService) Analyze(_ context.Context, encoded []byte, mime string) (paletteassistant.AnalyzeResponse, error) {
	s.calls++
	s.encoded, s.mime = append([]byte(nil), encoded...), mime
	return s.response, s.err
}

func TestAnalyzeHandlerSuccessAndExactMultipart(t *testing.T) {
	service := &stubAnalyzeService{response: paletteassistant.AnalyzeResponse{ContractVersion: paletteassistant.ContractVersion, AnalysisID: "11111111-1111-4111-8111-111111111111", Draft: paletteassistant.AssistantDraft{ContractVersion: paletteassistant.ContractVersion, Revision: 1, SourceType: paletteassistant.OnlineSourceType}}}
	recorder := serveAnalyze(t, service, multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("png")}}), adminAuth()...)
	if recorder.Code != http.StatusOK || service.calls != 1 || string(service.encoded) != "png" || service.mime != "image/png" {
		t.Fatalf("status=%d calls=%d bytes=%q mime=%q body=%s", recorder.Code, service.calls, service.encoded, service.mime, recorder.Body.String())
	}
	var response paletteassistant.AnalyzeResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.ContractVersion != paletteassistant.ContractVersion {
		t.Fatalf("invalid response: %v %s", err, recorder.Body.String())
	}
}

func TestAnalyzeHandlerRealEndToEndFlow(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 16, G: 32, B: 48, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		t.Fatal(err)
	}
	recorder := serveAnalyze(t, NewService(), multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: encoded.Bytes()}}), adminAuth()...)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var response paletteassistant.AnalyzeResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.Image.Format != "png" || response.AlgorithmVersion != imageanalysis.AlgorithmVersion || len(response.Warnings) < 2 || response.Draft.Revision != 1 {
		t.Fatalf("real Analyze flow incomplete: %#v err=%v", response, err)
	}
}

func TestAnalyzeHandlerTransportProblems(t *testing.T) {
	cases := []struct {
		name        string
		request     func(*testing.T) *http.Request
		wantStatus  int
		wantProblem paletteassistant.ProblemCode
	}{
		{"wrong_content_type", func(t *testing.T) *http.Request {
			return httptest.NewRequest(http.MethodPost, paletteassistant.AnalyzePath, strings.NewReader("x"))
		}, 415, paletteassistant.ErrUnsupportedMediaType},
		{"missing_boundary", func(t *testing.T) *http.Request {
			request := httptest.NewRequest(http.MethodPost, paletteassistant.AnalyzePath, strings.NewReader("x"))
			request.Header.Set("Content-Type", "multipart/form-data")
			return request
		}, 415, paletteassistant.ErrUnsupportedMediaType},
		{"malformed_boundary", func(t *testing.T) *http.Request {
			request := multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("x")}})
			request.Header.Set("Content-Type", "multipart/form-data; boundary=wrong")
			return request
		}, 400, paletteassistant.ErrMalformedRequest},
		{"missing", func(t *testing.T) *http.Request { return multipartRequest(t, nil) }, 400, paletteassistant.ErrMissingImage},
		{"empty", func(t *testing.T) *http.Request {
			return multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png"}})
		}, 400, paletteassistant.ErrMissingImage},
		{"other_field", func(t *testing.T) *http.Request {
			return multipartRequest(t, []multipartPart{{name: "caption", contentType: "text/plain", data: []byte("x")}})
		}, 400, paletteassistant.ErrMalformedRequest},
		{"multiple", func(t *testing.T) *http.Request {
			return multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("a")}, {name: "image", contentType: "image/png", data: []byte("b")}})
		}, 400, paletteassistant.ErrMultipleImages},
		{"unsupported_part_type", func(t *testing.T) *http.Request {
			return multipartRequest(t, []multipartPart{{name: "image", contentType: "image/gif", data: []byte("x")}})
		}, 415, paletteassistant.ErrUnsupportedMediaType},
		{"encoded_too_large", func(t *testing.T) *http.Request {
			return multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: bytes.Repeat([]byte{'x'}, int(paletteassistant.EncodedImageLimit)+1)}})
		}, 413, paletteassistant.ErrRequestTooLarge},
		{"multipart_body_too_large", func(t *testing.T) *http.Request {
			request := multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("x")}})
			request.ContentLength = paletteassistant.MultipartBodyLimit + 1
			return request
		}, 413, paletteassistant.ErrRequestTooLarge},
		{"unknown_length_oversized_epilogue", func(t *testing.T) *http.Request {
			return sizedEpilogueRequest(t, paletteassistant.MultipartBodyLimit+1, true)
		}, 413, paletteassistant.ErrRequestTooLarge},
		{"unknown_length_streamed_over_limit", func(t *testing.T) *http.Request {
			request := sizedEpilogueRequest(t, paletteassistant.MultipartBodyLimit+1, true)
			request.Body = io.NopCloser(&chunkReader{data: mustReadAll(t, request.Body)})
			return request
		}, 413, paletteassistant.ErrRequestTooLarge},
		{"unknown_length_exact_limit", func(t *testing.T) *http.Request {
			return sizedEpilogueRequest(t, paletteassistant.MultipartBodyLimit, true)
		}, 200, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &stubAnalyzeService{}
			recorder := serveAnalyze(t, service, tc.request(t), adminAuth()...)
			if tc.wantStatus == http.StatusOK {
				if recorder.Code != http.StatusOK || service.calls != 1 {
					t.Fatalf("status=%d calls=%d body=%s", recorder.Code, service.calls, recorder.Body.String())
				}
				return
			}
			assertProblem(t, recorder, tc.wantStatus, tc.wantProblem)
			if service.calls != 0 {
				t.Fatal("service called for invalid transport")
			}
		})
	}
}

func TestAnalyzeHandlerAllowsBoundedMultipartEpilogueAndJPEG(t *testing.T) {
	for _, tc := range []struct {
		name    string
		request *http.Request
		mime    string
	}{
		{"small_epilogue", sizedEpilogueRequest(t, 512, true), "image/png"},
		{"jpeg", multipartRequest(t, []multipartPart{{name: "image", contentType: "image/jpeg", data: []byte("jpeg")}}), "image/jpeg"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service := &stubAnalyzeService{response: paletteassistant.AnalyzeResponse{Draft: paletteassistant.AssistantDraft{}}}
			recorder := serveAnalyze(t, service, tc.request, adminAuth()...)
			if recorder.Code != http.StatusOK || service.calls != 1 || service.mime != tc.mime {
				t.Fatalf("status=%d calls=%d mime=%q body=%s", recorder.Code, service.calls, service.mime, recorder.Body.String())
			}
		})
	}
}

func TestAnalyzeHandlerMapsSafeAnalysisProblems(t *testing.T) {
	cases := []struct {
		err    error
		code   paletteassistant.ProblemCode
		status int
	}{
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorEmptyInput}, paletteassistant.ErrMissingImage, 400},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorEncodedSizeExceeded}, paletteassistant.ErrRequestTooLarge, 413},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorSignatureMismatch}, paletteassistant.ErrImageSignatureMismatch, 415},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorDecodeFailed}, paletteassistant.ErrImageDecodeFailed, 422},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorWidthExceeded}, paletteassistant.ErrImageDimensionsExceeded, 422},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorPixelLimitExceeded}, paletteassistant.ErrImagePixelLimitExceeded, 422},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorDeadlineExceeded}, paletteassistant.ErrAnalysisTimeout, 504},
		{&imageanalysis.AnalysisError{Code: imageanalysis.ErrorCapacityUnavailable}, paletteassistant.ErrAnalysisOverloaded, 503},
		{errors.New("secret decoder detail"), paletteassistant.ErrInternalAnalysisFailure, 500},
	}
	for _, tc := range cases {
		service := &stubAnalyzeService{err: tc.err}
		recorder := serveAnalyze(t, service, multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("x")}}), adminAuth()...)
		assertProblem(t, recorder, tc.status, tc.code)
		if strings.Contains(recorder.Body.String(), "secret") {
			t.Fatal("internal error leaked")
		}
	}
}

func TestAnalyzeAuthenticationProblemEnvelopes(t *testing.T) {
	service := &stubAnalyzeService{}
	request := multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("x")}})
	recorder := serveAnalyze(t, service, request, middleware.Auth("secret", nil), middleware.AdminRequired())
	assertProblem(t, recorder, 401, paletteassistant.ErrAuthenticationRequired)

	request = multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("x")}})
	recorder = serveAnalyze(t, service, request, func(c *gin.Context) { authctx.SetUser(c, "user", "user") }, middleware.AdminRequired())
	assertProblem(t, recorder, 403, paletteassistant.ErrAdminRequired)
	if service.calls != 0 {
		t.Fatal("unauthorized request reached analysis")
	}
}

type multipartPart struct {
	name, contentType string
	data              []byte
}

func multipartRequest(t *testing.T, parts []multipartPart) *http.Request {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for _, part := range parts {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", `form-data; name="`+part.name+`"; filename="upload"`)
		header.Set("Content-Type", part.contentType)
		writer, err := w.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(part.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, paletteassistant.AnalyzePath, &body)
	request.Header.Set("Content-Type", w.FormDataContentType())
	return request
}

func sizedEpilogueRequest(t *testing.T, total int64, unknownLength bool) *http.Request {
	t.Helper()
	request := multipartRequest(t, []multipartPart{{name: "image", contentType: "image/png", data: []byte("x")}})
	raw := mustReadAll(t, request.Body)
	if int64(len(raw)) > total {
		t.Fatalf("multipart base %d exceeds requested total %d", len(raw), total)
	}
	raw = append(raw, bytes.Repeat([]byte{'e'}, int(total)-len(raw))...)
	request.Body = io.NopCloser(bytes.NewReader(raw))
	request.ContentLength = int64(len(raw))
	if unknownLength {
		request.ContentLength = -1
	}
	return request
}

func mustReadAll(t *testing.T, reader io.Reader) []byte {
	t.Helper()
	raw, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

type chunkReader struct {
	data []byte
}

func (r *chunkReader) Read(p []byte) (int, error) {
	if len(r.data) == 0 {
		return 0, io.EOF
	}
	n := len(p)
	if n > 1024 {
		n = 1024
	}
	if n > len(r.data) {
		n = len(r.data)
	}
	copy(p[:n], r.data[:n])
	r.data = r.data[n:]
	return n, nil
}

func serveAnalyze(t *testing.T, service analyzeService, request *http.Request, middlewareHandlers ...gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	handler, err := NewHandler(service)
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	api := router.Group("/api")
	handler.RegisterRoutes(api, middlewareHandlers[0], middlewareHandlers[1])
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func adminAuth() []gin.HandlerFunc {
	return []gin.HandlerFunc{func(c *gin.Context) { authctx.SetUser(c, "admin", "admin") }, middleware.AdminRequired()}
}

func assertProblem(t *testing.T, recorder *httptest.ResponseRecorder, status int, code paletteassistant.ProblemCode) {
	t.Helper()
	var problem paletteassistant.Problem
	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil || recorder.Code != status || problem.Code != code || problem.Message == "" || problem.Retryable != problemSpec(code).Retryable {
		t.Fatalf("problem status=%d body=%s parsed=%#v err=%v", recorder.Code, recorder.Body.String(), problem, err)
	}
}
