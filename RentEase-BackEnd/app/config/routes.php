<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
/**
 * ------------------------------------------------------------------
 * LavaLust - an opensource lightweight PHP MVC Framework
 * ------------------------------------------------------------------
 *
 * MIT License
 *
 * Copyright (c) 2020 Ronald M. Marasigan
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * @package LavaLust
 * @author Ronald M. Marasigan <ronald.marasigan@yahoo.com>
 * @since Version 1
 * @link https://github.com/ronmarasigan/LavaLust
 * @license https://opensource.org/licenses/MIT MIT License
 */

/*
| -------------------------------------------------------------------
| URI ROUTING
| -------------------------------------------------------------------
| Here is where you can register web routes for your application.
|
|
*/
/** @var object $router **/


/*
| -------------------------------------------------------------------
| MIDDLEWARE (registered in app/config/middleware.php)
| -------------------------------------------------------------------
| Global: every route gets security headers, rate limiting and the JSON-only check.
| This call MUST come before the routes are declared.
*/
$router->add_global_middleware(['security_headers', 'throttle', 'json_only']);

/*
| -------------------------------------------------------------------
| PUBLIC ROUTES
| -------------------------------------------------------------------
*/
$router->get('/', 'Welcome::index');
$router->get('api/health', 'Welcome::health');
$router->get('api/health/ready', 'Welcome::ready');
$router->get('api/assets/{key}', 'AssetController::show'); // public tenant-facing image, scoped by owner query
$router->get('api/settings', 'SettingsController::show'); // fixed RentEase defaults
$router->get('api/public/assistant', 'PublicAssistantController::config');
$router->post('api/public/assistant/chat', 'PublicAssistantController::chat')->middleware('throttle_auth');

// Authentication (strict throttle: 10 tries / minute / IP)
$router->post('api/auth/login',   'AuthController::login')->middleware('throttle_auth');
$router->post('api/auth/google',  'AuthController::google')->middleware('throttle_auth');
$router->post('api/auth/register', 'AuthController::register')->middleware('throttle_auth');
$router->post('api/auth/google/register', 'AuthController::google_register')->middleware('throttle_auth');
$router->post('api/auth/refresh', 'AuthController::refresh')->middleware('throttle_auth');
$router->post('api/auth/password/forgot', 'PasswordResetController::request')->middleware('throttle_auth');
$router->post('api/auth/password/reset', 'PasswordResetController::reset')->middleware('throttle_auth');
$router->get('api/auth/tenant/invitation', 'AuthController::verify_tenant_invitation')->middleware('throttle_auth');
$router->post('api/auth/tenant/activate', 'AuthController::activate_tenant')->middleware('throttle_auth');
$router->post('api/auth/tenant/activate-google', 'AuthController::activate_tenant_google')->middleware('throttle_auth');

// Server-to-server endpoints (each protected by its own middleware)
$router->post('api/webhooks/paymongo', 'WebhookController::paymongo')->middleware('paymongo_webhook');
$router->post('api/cron/reminders',    'CronController::reminders')->middleware('cron');

/*
| -------------------------------------------------------------------
| LOGGED-IN ROUTES  (middleware: auth)  - any role
| -------------------------------------------------------------------
| The controller also checks that a tenant only opens their own bill / receipt.
*/
$router->group(['middleware' => ['auth']], function ($router) {
    $router->post('api/auth/logout',          'AuthController::logout');
    $router->get('api/auth/me',               'AuthController::me');
    $router->get('api/my/settings',           'SettingsController::show_for_user');
    $router->get('api/chats', 'ChatController::conversations');
    $router->post('api/chats/direct/{tenant_id}', 'ChatController::start_direct');
    $router->get('api/chats/{conversation_id}/messages', 'ChatController::messages');
    $router->post('api/chats/{conversation_id}/messages', 'ChatController::send');
    $router->delete('api/chats/{conversation_id}/clear', 'ChatController::clear');
    $router->delete('api/chat-messages/{message_id}', 'ChatController::unsend');
    $router->put('api/chat-messages/{message_id}/reaction', 'ChatController::reaction');
    $router->post('api/auth/change-password', 'AuthController::change_password');
    // My profile (landlord and tenant)
    $router->get('api/profile',           'ProfileController::show');
    $router->put('api/profile',           'ProfileController::update');
    $router->get('api/profile/photo',     'ProfileController::photo_show');
    $router->put('api/profile/photo',     'ProfileController::photo_upload');
    $router->delete('api/profile/photo',  'ProfileController::photo_delete');
    $router->get('api/bills/{id}/statement',  'BillController::statement');
    $router->get('api/payments/{id}/receipt', 'PaymentController::receipt');
    $router->get('api/maintenance/images/{id}', 'MaintenanceController::image_show');
});

/*
| -------------------------------------------------------------------
| LANDLORD / ADMIN ROUTES  (middleware: auth + admin)
| -------------------------------------------------------------------
*/
$router->group(['prefix' => 'api/admin', 'middleware' => ['auth', 'admin']], function ($router) {
    $router->get('onboarding', 'OnboardingController::status');
    $router->post('onboarding', 'OnboardingController::save');
    $router->post('onboarding/skip', 'OnboardingController::complete');
    $router->get('assistant/conversations', 'AssistantController::conversations');
    $router->post('assistant/conversations', 'AssistantController::create_conversation');
    $router->get('assistant/conversations/{id}', 'AssistantController::show_conversation');
    $router->delete('assistant/conversations/{id}', 'AssistantController::delete_conversation');
    $router->post('assistant/conversations/{id}/confirmation', 'AssistantController::record_confirmation');
    $router->post('assistant/chat', 'AssistantController::chat');
    $router->post('assistant/insights', 'AssistantController::insights');
    $router->post('assistant/units', 'AssistantController::add_units');
    $router->get('dashboard',     'DashboardController::index');
    $router->get('reports/landlord', 'DashboardController::landlord_report');
    $router->post('reports/landlord/summary', 'DashboardController::report_summary');
    $router->get('notifications', 'DashboardController::notifications');
    $router->get('in-app-notifications', 'InAppNotificationController::index');
    $router->get('in-app-notifications/unread-count', 'InAppNotificationController::unread_count');
    $router->get('in-app-notifications/sidebar-counts', 'InAppNotificationController::sidebar_counts');
    $router->patch('in-app-notifications/sections/{section}/read', 'InAppNotificationController::mark_section_read');
    $router->patch('in-app-notifications/read-all', 'InAppNotificationController::mark_all_read');
    $router->patch('in-app-notifications/{id}/read', 'InAppNotificationController::mark_read');
    $router->get('transfer-requests', 'UnitTransferController::admin_index');
    $router->patch('transfer-requests/{id}', 'UnitTransferController::decide');
    $router->delete('transfer-requests/{id}', 'UnitTransferController::admin_delete');
    $router->get('early-move-requests', 'EarlyMoveInController::admin_index');
    $router->patch('early-move-requests/{id}', 'EarlyMoveInController::decide');
    $router->delete('early-move-requests/{id}', 'EarlyMoveInController::admin_delete');

    // Site settings (name, theme colors, hero, glass look)
    $router->put('settings',          'SettingsController::update');
    $router->post('settings/reset',   'SettingsController::reset');
    $router->get('settings/history',  'SettingsController::history');
    $router->put('settings/image',    'SettingsController::image_upload');        // sidebar logo / tenant hero
    $router->delete('settings/image/{key}', 'SettingsController::image_delete');
    $router->get('announcements', 'AnnouncementController::index');
    $router->post('announcements', 'AnnouncementController::create');
    $router->put('announcements/{id}', 'AnnouncementController::update');
    $router->delete('announcements/{id}', 'AnnouncementController::delete');

    // Properties -> Units -> Tenants -> Leases
    $router->get('properties',          'PropertyController::index');
    $router->post('properties',         'PropertyController::store');
    $router->get('properties/{id}',     'PropertyController::show');
    $router->put('properties/{id}',     'PropertyController::update');
    $router->patch('properties/{id}',   'PropertyController::update');
    $router->delete('properties/{id}',  'PropertyController::destroy');
    $router->post('properties/{id}/restore', 'PropertyController::restore');

    $router->get('units',          'UnitController::index');
    $router->post('units',         'UnitController::store');
    $router->get('units/{id}',     'UnitController::show');
    $router->put('units/{id}',     'UnitController::update');
    $router->patch('units/{id}',   'UnitController::update');
    $router->delete('units/{id}',  'UnitController::destroy');
    $router->post('units/{id}/restore', 'UnitController::restore');

    $router->get('tenants',                       'TenantController::index');
    $router->post('tenants',                      'TenantController::store');
    $router->get('tenants/{id}',                  'TenantController::show');
    $router->put('tenants/{id}',                  'TenantController::update');
    $router->patch('tenants/{id}',                'TenantController::update');
    $router->post('tenants/{id}/reset-password',  'TenantController::reset_password');
    $router->post('tenants/{id}/resend-invite',   'TenantController::resend_invite');
    $router->post('tenants/{id}/reassign-unit',   'TenantController::reassign_unit');
    $router->delete('tenants/{id}',               'TenantController::destroy');

    $router->get('leases',            'LeaseController::index');
    $router->get('leases/financials', 'LeaseController::financials');
    $router->post('leases',           'LeaseController::store');
    $router->get('leases/{id}/history', 'LeaseController::history');
    $router->get('leases/{id}/documents', 'LeaseController::documents');
    $router->post('leases/{id}/documents', 'LeaseController::upload_document');
    $router->get('leases/{id}/documents/{document_id}', 'LeaseController::download_document');
    $router->delete('leases/{id}/documents/{document_id}', 'LeaseController::delete_document');
    $router->post('leases/{id}/renew', 'LeaseController::renew');
    $router->get('leases/{id}',       'LeaseController::show');
    $router->put('leases/{id}',       'LeaseController::update');
    $router->patch('leases/{id}',     'LeaseController::update');
    $router->post('leases/{id}/end',  'LeaseController::end');
    $router->post('leases/{id}/cancel', 'LeaseController::cancel');
    $router->delete('leases/{id}',    'LeaseController::destroy');

    // Billing & payments
    $router->get('bills',                 'BillController::index');
    $router->post('bills/generate',       'BillController::generate');
    $router->get('bills/{id}',            'BillController::show');
    $router->post('bills/{id}/remind',    'BillController::remind');
    $router->patch('bills/{id}',          'BillController::adjust');
    $router->delete('bills/{id}',         'BillController::destroy');
    $router->get('payments',              'PaymentController::index');
    $router->post('payments',             'PaymentController::store');

    // Maintenance
    $router->get('maintenance',           'MaintenanceController::index');
    $router->patch('maintenance/{id}',    'MaintenanceController::update');
    $router->put('maintenance/{id}',      'MaintenanceController::update');
    $router->delete('maintenance/{id}',   'MaintenanceController::delete');
});

/*
| -------------------------------------------------------------------
| PLATFORM SUPERADMIN ROUTES (middleware: auth + superadmin)
| -------------------------------------------------------------------
*/
$router->group(['prefix' => 'api/superadmin', 'middleware' => ['auth', 'superadmin']], function ($router) {
    $router->get('landlords', 'SuperadminController::landlords');
    $router->patch('landlords/{id}', 'SuperadminController::update_landlord');
    $router->delete('landlords/{id}', 'SuperadminController::delete_landlord');
    $router->post('landlords/{id}/send-password-reset', 'SuperadminController::send_landlord_reset');
    $router->get('accounts', 'SuperadminController::superadmins');
    $router->post('accounts', 'SuperadminController::create_superadmin');
    $router->patch('accounts/{id}', 'SuperadminController::update_superadmin');
});

/*
| -------------------------------------------------------------------
| TENANT PORTAL ROUTES  (middleware: auth + tenant)
| -------------------------------------------------------------------
*/
$router->group(['prefix' => 'api/my', 'middleware' => ['auth', 'tenant']], function ($router) {
    $router->get('summary',                  'TenantPortalController::summary');
    $router->get('announcements', 'AnnouncementController::published');
    $router->post('leases/{id}/accept', 'TenantPortalController::accept_lease_offer');
    $router->get('bills',                    'TenantPortalController::bills');
    $router->post('bills/{id}/pay',          'TenantPortalController::pay');
    $router->get('payments',                 'TenantPortalController::payments');
    $router->post('payments/{id}/verify',    'TenantPortalController::verify');
    $router->get('maintenance',              'TenantPortalController::maintenance_index');
    $router->post('maintenance',             'TenantPortalController::maintenance_store');
    $router->delete('maintenance/{id}',        'TenantPortalController::maintenance_delete');
    $router->get('available-units',          'UnitTransferController::available_units');
    $router->get('transfer-requests',         'UnitTransferController::tenant_index');
    $router->post('transfer-requests',        'UnitTransferController::store');
    $router->delete('transfer-requests/{id}', 'UnitTransferController::tenant_delete');
    $router->get('early-move-requests', 'EarlyMoveInController::tenant_index');
    $router->post('early-move-requests', 'EarlyMoveInController::store');
    $router->delete('early-move-requests/{id}', 'EarlyMoveInController::tenant_delete');
    $router->get('notifications',             'InAppNotificationController::index');
    $router->get('notifications/unread-count', 'InAppNotificationController::unread_count');
    $router->patch('notifications/read-all',  'InAppNotificationController::mark_all_read');
    $router->patch('notifications/{id}/read', 'InAppNotificationController::mark_read');
});

/*
| -------------------------------------------------------------------
| MIGRATION ROUTES  (Database Migration Laboratory Activity)
| -------------------------------------------------------------------
| Protected by the 'dev_only' middleware: they only answer when MIGRATION_ENABLED=true and
| APP_ENV is not "production". Used by:  php lava migration run | status | rollback ...
*/
$router->get('create-migration/{migration_class}', 'MigrationController::create_migration')->middleware('dev_only');
$router->get('migrate',      'MigrationController::migrate')->middleware('dev_only');
$router->get('rollback',     'MigrationController::rollback')->middleware('dev_only');
$router->get('rollback-all', 'MigrationController::rollback_all')->middleware('dev_only');
$router->get('refresh',      'MigrationController::refresh')->middleware('dev_only');
$router->get('status',       'MigrationController::status')->middleware('dev_only');
