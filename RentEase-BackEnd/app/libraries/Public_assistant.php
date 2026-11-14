<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Public_assistant
{
    private $config;

    public function __construct()
    {
        $this->config = config_item('assistant_public');
    }

    public function chips()
    {
        return $this->config['chips'] ?? [];
    }

    public function answer_for($message, $topic = '')
    {
        $key = $this->topic_for($message, $topic);
        $answer = $this->config['canned_answers'][$key] ?? $this->config['canned_answers']['unknown'];
        return ['reply' => $answer['reply'], 'action' => $answer['action'] ?? null, 'topic' => $key];
    }

    public function knowledge_base()
    {
        return (string) ($this->config['knowledge_base'] ?? '');
    }

    public function system_instruction()
    {
        return (string) ($this->config['system_instruction'] ?? '');
    }

    public function is_canned_topic($message, $topic = '')
    {
        return $this->topic_for($message, $topic) !== 'unknown';
    }

    private function topic_for($message, $topic)
    {
        $validTopics = array_keys($this->config['canned_answers'] ?? []);
        if (in_array($topic, $validTopics, true) && $topic !== 'unknown') {
            return $topic;
        }

        $text = mb_strtolower(trim((string) $message));
        $text = preg_replace('/[^a-z0-9\s]/u', ' ', $text);
        $text = preg_replace('/\s+/', ' ', $text);
        if (str_contains($text, 'forgot') || str_contains($text, 'forget') || str_contains($text, 'password reset')) {
            return 'tenant_forgot_password';
        }
        if ((str_contains($text, 'landlord') || str_contains($text, 'owner'))
            && (str_contains($text, 'get started') || str_contains($text, 'register') || str_contains($text, 'sign up') || str_contains($text, 'create an account'))) {
            return 'landlord_get_started';
        }
        if ((str_contains($text, 'tenant') || str_contains($text, 'renter'))
            && (str_contains($text, 'log in') || str_contains($text, 'login') || str_contains($text, 'sign in'))) {
            return 'tenant_login';
        }
        if ((str_contains($text, 'tenant') || str_contains($text, 'renter'))
            && (str_contains($text, 'access') || str_contains($text, 'invitation') || str_contains($text, 'account'))) {
            return 'tenant_access';
        }
        if (str_contains($text, 'tenant') && (str_contains($text, 'what can') || str_contains($text, 'do here') || str_contains($text, 'features'))) {
            return 'tenant_features';
        }
        if (str_contains($text, 'create an account') || str_contains($text, 'register') || str_contains($text, 'sign up')) {
            return 'tenant_account';
        }
        if (str_contains($text, 'landlord') && (str_contains($text, 'what can') || str_contains($text, 'features') || str_contains($text, 'do here'))) {
            return 'landlord_features';
        }
        if (str_contains($text, 'sign in') || str_contains($text, 'log in') || str_contains($text, 'login')) {
            return 'how_sign_in';
        }
        if (str_contains($text, 'who can use') || str_contains($text, 'who uses')) {
            return 'who_uses_rentease';
        }
        if (str_contains($text, 'what is rentease') || $text === 'rentease') {
            return 'what_is_rentease';
        }
        return 'unknown';
    }
}
