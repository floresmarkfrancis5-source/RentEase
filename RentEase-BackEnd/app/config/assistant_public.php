<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['assistant_public'] = [
    'knowledge_base' => <<<'FACTS'
RentEase is a rental management system for landlords. It supports property and unit management, tenant accounts, bills, payments, lease contracts, maintenance requests, tenant move-in and unit-transfer requests, and a landlord assistant.

Landlords can create their own landlord account on the public /register page using email, username, and password, or Google registration. After registering, a landlord completes the first-property setup.

Tenant accounts are created only by the tenant's landlord from the landlord dashboard. Tenants cannot create their own accounts or self-register. The landlord sends an invitation link that expires after seven days. The tenant activates the invitation by choosing a password, or by activating with the Google account matching the invited email. Activation signs the tenant in. If the invitation expires, the tenant should ask the landlord to resend it.

Tenants sign in at /login using their username or email and password. Google sign-in is available for an account linked to the invited email. If a tenant forgets their password, they can use the Forgot password link on the sign-in page or visit /forgot-password and request a reset email. If they cannot access the email account, they should contact their landlord.

After their landlord gives them access, tenants can view bills and payment status, pay bills online, access payment receipts, message their landlord, submit maintenance requests, make early move-in or unit-transfer requests, view published announcements, and review or accept a lease contract offer when one is provided.

Visitors may ask general questions about RentEase. The public assistant cannot access or look up a user's private rental records.
FACTS,
    'system_instruction' => <<<'PROMPT'
You are RentEase's public information assistant. Give concise, friendly answers using only the supplied RentEase knowledge base. Never promise features, access, or processes not explicitly listed in that knowledge base. Do not claim to access accounts or private rental records.

RentEase is landlord-managed. Tenants cannot self-register; explain that their landlord creates their account and sends a time-limited invitation. Do not show a tenant sign-up link or describe a tenant sign-up process.

Landlords can register themselves at /register. When asked how to register as a landlord, direct them to that route. When the question is specifically how a tenant can create an account, say that the landlord creates it and that tenants cannot sign up themselves; do not attach a registration action to that answer.

For tenant sign-in questions, explain the real /login flow: email or username and password, or Google for an account linked to the invited email. For forgotten passwords, point to /forgot-password; mention contacting the landlord if the tenant cannot access their email. Explain the landlord-issued invitation and activation process accurately, including its seven-day expiry.

If a question is outside the knowledge base, say you do not have that information and direct the visitor to the RentEase team. Never invent contact information; no support contact details are currently configured in this knowledge base.
PROMPT,
    'chips' => [
        ['id' => 'what_is_rentease', 'label' => 'What is RentEase?', 'question' => 'What is RentEase?'],
        ['id' => 'how_sign_in', 'label' => 'How do I sign in?', 'question' => 'How do I sign in?'],
        ['id' => 'landlord_features', 'label' => 'What can landlords do here?', 'question' => 'What can landlords do here?'],
        ['id' => 'tenant_access', 'label' => "I'm a tenant, how do I get access?", 'question' => "I'm a tenant, how do I get access?"],
        ['id' => 'who_uses_rentease', 'label' => 'Who can use RentEase?', 'question' => 'Who can use RentEase?'],
        ['id' => 'landlord_get_started', 'label' => 'How can I get started as a landlord?', 'question' => 'How can I get started as a landlord?'],
    ],
    'canned_answers' => [
        'what_is_rentease' => [
            'reply' => 'RentEase helps landlords manage properties, units, tenants, bills, payments, lease contracts, maintenance and move requests—all in one place. Tenants can use their landlord-provided access for their rental tasks.',
        ],
        'how_sign_in' => [
            'reply' => 'Go to the sign-in page and enter your email or username and password. You can also use Google if it is linked to your RentEase account.',
            'action' => ['label' => 'Sign in', 'href' => '/login'],
        ],
        'landlord_features' => [
            'reply' => 'Landlords can manage properties and units, create tenant accounts, manage leases, bills and payments, handle maintenance and move requests, publish announcements, and use the RentEase Assistant.',
        ],
        'tenant_access' => [
            'reply' => 'Your landlord creates your tenant account and sends you an invitation. Open that invitation to activate your account by choosing a password or using the Google account for your invited email. Invitations expire after seven days; ask your landlord to resend yours if it has expired.',
            'action' => ['label' => 'Sign in', 'href' => '/login'],
        ],
        'who_uses_rentease' => [
            'reply' => 'RentEase is designed for landlords to manage rentals and for their tenants to access rental services. A landlord must create each tenant account; tenants cannot sign themselves up.',
        ],
        'landlord_get_started' => [
            'reply' => 'Landlords can create an account on the registration page, then follow the first-time setup to add a property and its units.',
            'action' => ['label' => 'Create a landlord account', 'href' => '/register'],
        ],
        'tenant_account' => [
            'reply' => 'Tenant accounts are created by the landlord from inside the landlord dashboard. Tenants cannot create an account themselves. If you are a tenant, contact your landlord for an invitation.',
        ],
        'tenant_login' => [
            'reply' => 'Use the email or username and password provided during your landlord-issued invitation setup. If you activated with Google, use the same Google account that matches your invited email.',
            'action' => ['label' => 'Sign in', 'href' => '/login'],
        ],
        'tenant_forgot_password' => [
            'reply' => 'Use “Forgot password?” on the sign-in page to request a reset email. If you cannot access your account email, contact your landlord for help.',
            'action' => ['label' => 'Reset password', 'href' => '/forgot-password'],
        ],
        'tenant_features' => [
            'reply' => 'After your landlord gives you access, you can view bills and payment status, pay bills online, access receipts, message your landlord, submit maintenance and move requests, view announcements, and review lease offers when provided.',
        ],
        'unknown' => [
            'reply' => 'I don’t have verified information about that. I can answer questions about RentEase features, landlord sign-up, tenant invitations, sign-in, and password recovery.',
        ],
    ],
];
