<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class ChatController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Chat_model', 'User_model']);
    }

    public function conversations()
    {
        $this->api->require_method('GET');
        $user = $this->user();
        if (!in_array($user['role'] ?? '', ['admin', 'tenant'], true)) {
            $this->fail('Chats are not available for this account.', 403);
        }
        $this->ok(['data' => $this->Chat_model->list_for_user($this->uid(), $user)]);
    }

    public function start_direct($tenant_id)
    {
        $this->api->require_method('POST');
        if (($this->user()['role'] ?? '') !== 'admin') {
            $this->fail('Only landlords can start a tenant conversation.', 403);
        }
        $tenant = $this->User_model->find_tenant($tenant_id, $this->uid());
        if (!$tenant || (int) $tenant['is_active'] !== 1) {
            $this->fail('Active tenant account not found.', 404);
        }
        $conversation_id = $this->Chat_model->ensure_direct($this->uid(), $tenant_id, $this->uid());
        $this->ok(['data' => ['id' => $conversation_id]]);
    }

    private function accessible_conversation($conversation_id)
    {
        $conversation = $this->Chat_model->find_accessible($conversation_id, $this->uid(), $this->user());
        if (!$conversation) {
            $this->fail('Conversation not found or unavailable.', 404);
        }
        return $conversation;
    }

    public function messages($conversation_id)
    {
        $this->api->require_method('GET');
        $this->accessible_conversation($conversation_id);
        $query = $this->api->get_query_params();
        $before = isset($query['before']) && ctype_digit((string) $query['before'])
            ? (int) $query['before']
            : null;
        $this->ok(['data' => $this->Chat_model->messages($conversation_id, $this->uid(), $before)]);
    }

    public function send($conversation_id)
    {
        $this->api->require_method('POST');
        $conversation = $this->accessible_conversation($conversation_id);
        $input = $this->input();
        $content = trim((string) ($input['content'] ?? ''));
        if (mb_strlen($content) > 4000) {
            $this->fail('Messages must be 4,000 characters or fewer.', 422, ['content' => 'Maximum 4,000 characters.']);
        }
        $image = $input['image'] ?? null;
        if ($image !== null && (!is_string($image)
            || !preg_match('#^data:image/(png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$#', $image))) {
            $this->fail('Choose a PNG, JPG, or WebP image.', 422, ['image' => 'Unsupported image format.']);
        }
        if ($image !== null) {
            $encoded_image = substr($image, strpos($image, ',') + 1);
            $decoded_image = base64_decode($encoded_image, true);
            if ($decoded_image === false || strlen($decoded_image) > 650 * 1024) {
                $this->fail('Chat images must be 650 KB or smaller.', 422, ['image' => 'Image is too large or invalid.']);
            }
        }
        if ($content === '' && $image === null) {
            $this->fail('Write a message or attach an image.', 422, ['content' => 'A message or image is required.']);
        }
        $reply_to_message_id = $this->validate($input, [
            'reply_to_message_id' => ['type' => 'int', 'min' => 1, 'nullable' => true],
        ])['reply_to_message_id'];
        if ($reply_to_message_id !== null
            && !$this->Chat_model->reply_target($reply_to_message_id, $conversation_id, $this->uid())) {
            $this->fail('The message you are replying to is not available in this conversation.', 422, [
                'reply_to_message_id' => 'Choose a message from this conversation.',
            ]);
        }

        $image_url = null;
        $image_public_id = null;
        if ($image !== null) {
            $this->call->library('cloudinary');
            if (!$this->cloudinary->configured()) {
                $this->fail('Image sharing is not configured.', 503);
            }
            $upload = $this->cloudinary->upload($image, 'rentease/chat/' . (int) $conversation['landlord_id']);
            if (!$upload['url']) {
                $this->fail('The image could not be uploaded: ' . ($upload['error'] ?? 'Cloudinary upload failed.'), 502);
            }
            $image_url = $upload['url'];
            $image_public_id = $upload['public_id'];
        }

        $message_id = $this->Chat_model->create_message(
            $conversation_id,
            $this->uid(),
            $content === '' ? null : $content,
            $image_url,
            $image_public_id,
            $reply_to_message_id
        );
        $this->ok(['message' => 'Message sent.', 'data' => ['id' => $message_id]], 201);
    }

    public function clear($conversation_id)
    {
        $this->api->require_method('DELETE');
        $conversation = $this->accessible_conversation($conversation_id);
        $hide = ($this->user()['role'] ?? '') === 'admin' && $conversation['conversation_type'] === 'direct';
        $this->Chat_model->clear_for_user($conversation_id, $this->uid(), $hide);
        $this->ok(['message' => 'Conversation cleared for your account.']);
    }

    public function unsend($message_id)
    {
        $this->api->require_method('DELETE');
        $input = $this->input();
        $conversation_id = (int) ($input['conversation_id'] ?? 0);
        $this->accessible_conversation($conversation_id);
        if (!$this->Chat_model->unsend($message_id, $this->uid(), $conversation_id)) {
            $this->fail('You can only unsend your own message.', 404);
        }
        $this->ok(['message' => 'Message unsent.']);
    }

    public function reaction($message_id)
    {
        $this->api->require_method('PUT');
        $input = $this->input();
        $data = $this->validate($input, [
            'conversation_id' => ['type' => 'int', 'required' => true, 'min' => 1],
            'reaction' => ['type' => 'enum', 'values' => ['like', 'dislike', 'haha'], 'nullable' => true],
        ]);
        $this->accessible_conversation($data['conversation_id']);
        if (!$this->Chat_model->message_in_conversation($message_id, $data['conversation_id'], $this->uid())) {
            $this->fail('Message not found.', 404);
        }
        if ($data['reaction'] === null) {
            $this->Chat_model->remove_reaction($message_id, $this->uid());
        } else {
            $this->Chat_model->set_reaction($message_id, $this->uid(), $data['reaction']);
        }
        $this->ok(['message' => 'Reaction updated.']);
    }
}
