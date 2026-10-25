<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Server-side Gemini client for drafting landlord-approved rental setup actions. */
class Gemini
{
    public function configured()
    {
        return (string) config_item('gemini_api_key') !== '';
    }

    public function rental_assistant(array $messages)
    {
        if (!$this->configured()) {
            throw new RuntimeException('The Gemini assistant is not configured on this server.');
        }

        $contents = [];
        foreach ($messages as $message) {
            $contents[] = [
                'role' => $message['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $message['content']]],
            ];
        }

        $model = rawurlencode((string) config_item('gemini_model'));
        $url = rtrim((string) config_item('gemini_api_url'), '/') . '/models/' . $model . ':generateContent';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'x-goog-api-key: ' . (string) config_item('gemini_api_key'),
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'contents' => $contents,
                'systemInstruction' => ['parts' => [['text' => $this->instructions()]]],
                'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2, 'maxOutputTokens' => 2048],
            ], JSON_THROW_ON_ERROR),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException('Cannot reach the Gemini API: ' . $curl_error);
        }
        $response = json_decode($raw, true);
        if ($status >= 400 || !is_array($response)) {
            $detail = $response['error']['message'] ?? ('HTTP ' . $status);
            throw new RuntimeException('Gemini request failed: ' . $detail);
        }
        $text = $response['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $result = json_decode((string) $text, true);
        if (!is_array($result) || !isset($result['reply']) || !is_string($result['reply'])) {
            throw new RuntimeException('Gemini returned an invalid assistant response. Please try again.');
        }
        if (!array_key_exists('proposal', $result)) {
            $result['proposal'] = null;
        }
        if ($result['proposal'] !== null && !is_array($result['proposal'])) {
            throw new RuntimeException('Gemini returned an invalid setup draft. Please ask it to try again.');
        }
        return ['reply' => $result['reply'], 'proposal' => $result['proposal']];
    }

    private function instructions()
    {
        return <<<'PROMPT'
You are RentEase's rental setup assistant. Help landlords add one property, its units, and optionally existing tenants with leases.
Only discuss rental setup in RentEase. Never claim you saved anything. Never execute actions or request passwords.
Ask concise follow-up questions when important information is missing. Do not invent names, addresses, rents, tenant details, or terms.
When the landlord has supplied enough information for a complete draft, return a proposal for exactly one property with at least one unit.
Tenant accounts require a chosen username, full name, email, and an assignment to a distinct unit in good condition. The server generates temporary passwords after confirmation.
Use property keys: name, type (apartment or boarding_house), address, city, barangay, description. Coordinates may be omitted; the landlord can pin the map before confirmation.
Use unit keys: unit_name, monthly_rent, capacity, condition_tag (good_condition or under_maintenance).
Use tenant keys: username, email, full_name, phone, unit_index (zero-based), start_date (YYYY-MM-DD), monthly_rent (optional), deposit, due_day (1–28).
Return only valid JSON with exactly this shape: {"reply":"assistant response","proposal":null} or {"reply":"summary","proposal":{"property":{...},"units":[...],"tenants":[...]}}.
PROMPT;
    }
}
