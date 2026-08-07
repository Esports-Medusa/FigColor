package palette

import "testing"

func TestCandidateReviewUpdateCannotChangePublicationState(t *testing.T) {
	for _, requested := range []string{"draft", "published", "archived"} {
		req := &UpdatePaletteRequest{Status: &requested}
		applyCandidateReviewUpdateBoundary(&Palette{Status: "candidate"}, req)
		if req.Status != nil {
			t.Fatalf("candidate update retained requested status %q", requested)
		}
	}
}

func TestNonCandidateAdminUpdateKeepsExistingStatusContract(t *testing.T) {
	requested := "draft"
	req := &UpdatePaletteRequest{Status: &requested}
	applyCandidateReviewUpdateBoundary(&Palette{Status: "published"}, req)
	if req.Status == nil || *req.Status != requested {
		t.Fatalf("non-candidate status update was unexpectedly removed")
	}
}
