<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Gemini only drafts rental setup actions; the landlord confirms through the setup API. */
class AssistantController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Assistant_conversation_model');
    }

    public function conversations()
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->Assistant_conversation_model->list_for_user($this->uid())]);
    }

    public function create_conversation()
    {
        $this->api->require_method('POST');
        $this->ok(['data' => $this->Assistant_conversation_model->create_for_user($this->uid())], 201);
    }

    public function show_conversation($id)
    {
        $this->api->require_method('GET');
        $conversation = $this->Assistant_conversation_model->get_for_user($id, $this->uid());
        $this->ok(['data' => $this->not_found_unless($conversation, 'Conversation')]);
    }

    public function delete_conversation($id)
    {
        $this->api->require_method('DELETE');
        if (!$this->Assistant_conversation_model->delete_for_user($id, $this->uid())) {
            $this->fail('Conversation not found.', 404);
        }
        $this->ok(['message' => 'Conversation deleted.']);
    }

    public function record_confirmation($id)
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'message' => ['type' => 'string', 'required' => true, 'max' => 500],
        ]);
        $saved = $this->Assistant_conversation_model->append_confirmation($id, $this->uid(), $data['message']);
        if (!$saved) {
            $this->fail('Conversation not found.', 404);
        }
        $this->ok(['message' => 'Confirmation saved.']);
    }

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

        $conversation_id = null;
        if (array_key_exists('conversation_id', $in)) {
            if (!is_numeric($in['conversation_id']) || (int) $in['conversation_id'] < 1) {
                $this->fail('Conversation not found.', 404);
            }
            $conversation_id = (int) $in['conversation_id'];
        }
        $edit_message_id = null;
        if (array_key_exists('edit_message_id', $in)) {
            if (!is_numeric($in['edit_message_id']) || (int) $in['edit_message_id'] < 1 || $conversation_id === null) {
                $this->fail('The message cannot be edited.', 422);
            }
            $edit_message_id = (int) $in['edit_message_id'];
        }

        $turn = $this->Assistant_conversation_model->save_user_turn(
            $conversation_id,
            $this->uid(),
            $message,
            $messages,
            $edit_message_id
        );
        if (!$turn) {
            $this->fail('Conversation or message not found.', 404);
        }
        $messages = array_merge($turn['history'], [['role' => 'user', 'content' => $message]]);

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
        $assistant_message_id = $this->Assistant_conversation_model->save_assistant_message(
            $turn['conversation_id'],
            $this->uid(),
            $result['reply'],
            $result['proposal']
        );
        if (!$assistant_message_id) {
            $this->fail('Conversation not found.', 404);
        }
        $result['conversation_id'] = $turn['conversation_id'];
        $result['user_message_id'] = $turn['user_message_id'];
        $result['assistant_message_id'] = $assistant_message_id;
        $this->ok(['data' => $result]);
    }
}
