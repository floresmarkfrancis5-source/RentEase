<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Gemini only drafts rental setup actions; the landlord confirms through the setup API. */
class AssistantController extends BaseApiController
{
    public function chat()
    {
        $this->api->require_method('POST');
        $in = $this->input();
        $message = trim((string) ($in['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 4000) {
            $this->fail('Enter a message up to 4,000 characters.', 422, ['message' => 'Required; maximum 4,000 characters.']);
        }

        $history = $in['history'] ?? [];
        if (!is_array($history) || count($history) > 10) {
            $this->fail('Conversation history is invalid. Start a new chat.', 422, ['history' => 'Send no more than 10 prior messages.']);
        }
        $messages = [];
        foreach ($history as $index => $item) {
            if (!is_array($item) || !in_array($item['role'] ?? '', ['user', 'assistant'], true)
                || !is_string($item['content'] ?? null) || mb_strlen($item['content']) > 2000) {
                $this->fail('Conversation history is invalid. Start a new chat.', 422, ['history.' . $index => 'Invalid message.']);
            }
            $messages[] = ['role' => $item['role'], 'content' => $item['content']];
        }
        $messages[] = ['role' => 'user', 'content' => $message];

        $this->call->library('gemini');
        if (!$this->gemini->configured()) {
            $this->fail('The Gemini assistant is not configured. Set GEMINI_API_KEY on the API server.', 503);
        }
        try {
            $result = $this->gemini->rental_assistant($messages);
        } catch (RuntimeException $e) {
            error_log('RentEase Gemini assistant error: ' . $e->getMessage());
            $this->fail($e->getMessage(), 502);
        }
        $this->ok(['data' => $result]);
    }
}
