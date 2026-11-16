<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Welcome extends Controller
{
	public function index() {
    	header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; frame-ancestors 'none'");
    	$this->call->view('welcome_page');
	}

	public function health()
	{
		header('Content-Type: application/json');
		echo json_encode(['status' => 'ok', 'service' => 'RentEase API']);
	}

	public function ready()
	{
		header('Content-Type: application/json');
		$started = microtime(true);
		try {
			$db = $this->call->database();
			$db->raw('SELECT 1')->fetchColumn();
			echo json_encode([
				'status' => 'ready',
				'service' => 'RentEase API',
				'database' => 'ok',
				'database_ms' => round((microtime(true) - $started) * 1000, 1),
			]);
		} catch (Throwable $e) {
			error_log('RentEase database readiness check failed: ' . $e->getMessage());
			http_response_code(503);
			echo json_encode([
				'status' => 'degraded',
				'service' => 'RentEase API',
				'database' => 'unavailable',
				'database_ms' => round((microtime(true) - $started) * 1000, 1),
			]);
		}
	}
}
