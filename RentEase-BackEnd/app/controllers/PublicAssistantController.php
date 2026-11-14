<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class PublicAssistantController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->library('public_assistant');
        $this->call->library('gemini');
    }

    public function config()
    {
        $this->api->require_method('GET');
        $this->ok(['data' => ['chips' => $this->public_assistant->chips()]]);
    }

    public function chat()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'message' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 500],
            'topic' => ['type' => 'string', 'max' => 60, 'default' => ''],
        ]);
        $message = trim($data['message']);
        if ($message === '') {
            $this->fail('Enter a question about RentEase.', 422, ['message' => 'A question is required.']);
        }

        if ($this->public_assistant->is_canned_topic($message, $data['topic'])) {
            $this->ok($this->public_assistant->answer_for($message, $data['topic']));
        }

        try {
            $reply = $this->gemini->answer_public_question(
                $message,
                $this->public_assistant->knowledge_base(),
                $this->public_assistant->system_instruction()
            );
            $this->ok(['reply' => $reply, 'action' => null, 'topic' => 'general']);
        } catch (RuntimeException $error) {
            $this->ok([
                'reply' => $this->public_assistant->answer_for($message)['reply'],
                'action' => null,
                'topic' => 'unknown',
                'fallback' => true,
            ]);
        }
    }
}
