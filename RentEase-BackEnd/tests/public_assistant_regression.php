<?php
define('PREVENT_DIRECT_ACCESS', true);

$config = [];
require __DIR__ . '/../app/config/assistant_public.php';

function config_item($key)
{
    global $config;
    return $config[$key] ?? null;
}

require __DIR__ . '/../app/libraries/Public_assistant.php';
require __DIR__ . '/../app/libraries/Gemini.php';

function public_assistant_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

class PublicAssistantScriptedGemini extends Gemini
{
    public $calls = [];

    protected function generate_content(
        array $contents,
        $instructions,
        $maxOutputTokens,
        ?array $tools = null,
        $temperature = 0.7,
        $functionCallingMode = 'AUTO',
        $timeoutSeconds = 35
    ) {
        $this->calls[] = compact(
            'contents',
            'instructions',
            'maxOutputTokens',
            'tools',
            'temperature',
            'functionCallingMode',
            'timeoutSeconds'
        );
        return ['parts' => [['text' => 'This answer uses only verified RentEase information.']]];
    }
}

$assistant = new Public_assistant();
$chips = $assistant->chips();
$chipIds = array_column($chips, 'id');
public_assistant_assert(
    in_array('landlord_get_started', $chipIds, true)
        && !in_array('How do I create an account?', array_column($chips, 'label'), true)
        && !in_array('What can tenants do here?', array_column($chips, 'label'), true),
    'Public suggested questions do not match the landlord-managed account model.'
);

$tenantAccount = $assistant->answer_for('How do I create an account?');
public_assistant_assert(
    $tenantAccount['topic'] === 'tenant_account'
        && strpos($tenantAccount['reply'], 'created by the landlord') !== false
        && strpos($tenantAccount['reply'], 'cannot create an account themselves') !== false
        && $tenantAccount['action'] === null,
    'A general account-creation question must explain that landlords create tenant accounts without showing a sign-up action.'
);

$tenantLogin = $assistant->answer_for("I'm a tenant, how do I log in?");
public_assistant_assert(
    $tenantLogin['topic'] === 'tenant_login'
        && strpos($tenantLogin['reply'], 'email or username and password') !== false
        && ($tenantLogin['action']['href'] ?? null) === '/login'
        && ($tenantLogin['action']['label'] ?? null) === 'Sign in',
    'Tenant login guidance must describe landlord-issued credentials and provide the real sign-in route.'
);

$forgotPassword = $assistant->answer_for('I forgot my tenant password');
public_assistant_assert(
    $forgotPassword['topic'] === 'tenant_forgot_password'
        && strpos($forgotPassword['reply'], 'request a reset email') !== false
        && strpos($forgotPassword['reply'], 'contact your landlord') !== false
        && ($forgotPassword['action']['href'] ?? null) === '/forgot-password',
    'Tenant password recovery must use the real reset flow and explain when to contact the landlord.'
);

$tenantFeatures = $assistant->answer_for('What can tenants do?');
public_assistant_assert(
    $tenantFeatures['topic'] === 'tenant_features'
        && strpos($tenantFeatures['reply'], 'view bills') !== false
        && strpos($tenantFeatures['reply'], 'submit maintenance') !== false
        && strpos($tenantFeatures['reply'], 'review lease offers') !== false,
    'Tenant capabilities must be limited to features supported by the application.'
);

$landlordRegistration = $assistant->answer_for('How can I get started as a landlord?');
public_assistant_assert(
    $landlordRegistration['topic'] === 'landlord_get_started'
        && ($landlordRegistration['action']['href'] ?? null) === '/register'
        && strpos($landlordRegistration['reply'], 'registration page') !== false,
    'Landlord onboarding guidance must point to the verified public registration route.'
);

$knowledge = $assistant->knowledge_base();
$instructions = $assistant->system_instruction();
public_assistant_assert(
    strpos($knowledge, 'expires after seven days') !== false
        && strpos($knowledge, 'Google sign-in is available') !== false
        && strpos($instructions, 'Never invent contact information') !== false
        && strpos($instructions, 'Do not show a tenant sign-up link') !== false,
    'The public assistant knowledge or system instruction is missing verified registration and tenant-access constraints.'
);

$gemini = new PublicAssistantScriptedGemini();
$reply = $gemini->answer_public_question('What is RentEase?', $knowledge, $instructions);
public_assistant_assert(
    $reply === 'This answer uses only verified RentEase information.'
        && count($gemini->calls) === 1
        && $gemini->calls[0]['tools'] === []
        && $gemini->calls[0]['functionCallingMode'] === 'NONE'
        && strpos($gemini->calls[0]['instructions'], $knowledge) !== false,
    'Public assistant Gemini responses must be plain text and grounded in the supplied knowledge base.'
);

echo "Public assistant regression checks passed.\n";
