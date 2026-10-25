<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Welcome extends Controller
{
	/** LavaLust's default welcome page (left exactly as the framework ships it). */
	public function index() {
		// The welcome page is HTML with inline CSS + Google Fonts; the global API policy
    	// (default-src 'none') would block them, so loosen it for this page only.
    	header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; frame-ancestors 'none'");
    	$this->call->view('welcome_page');
	}

	/** Public health-check used by Render and for quick testing:  GET /api/health */
	public function health()
	{
		header('Content-Type: application/json');
		echo json_encode(['status' => 'ok', 'service' => 'RentEase API']);
	}
}
