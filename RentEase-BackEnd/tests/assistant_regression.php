<?php
define('PREVENT_DIRECT_ACCESS', true);

function config_item($key)
{
    return $key === 'assistant_debug' ? false : '';
}

class Model
{
}

require __DIR__ . '/../app/libraries/Gemini.php';
require __DIR__ . '/../app/libraries/Assistant_tools.php';

class ScriptedGemini extends Gemini
{
    public $calls = [];
    public $responses = [];

    protected function generate_content(
        array $contents,
        $instructions,
        $maxOutputTokens,
        ?array $tools = null,
        $temperature = 0.7,
        $functionCallingMode = 'AUTO',
        $timeoutSeconds = 35
    )
    {
        $this->calls[] = compact('contents', 'instructions', 'maxOutputTokens', 'tools', 'temperature', 'functionCallingMode', 'timeoutSeconds');
        if (!$this->responses) {
            throw new RuntimeException('Unexpected Gemini request.');
        }
        $response = array_shift($this->responses);
        if (isset($response['throw'])) {
            throw new RuntimeException($response['throw']);
        }
        return $response;
    }
}

class AssistantTestQuery
{
    public $likeCalls = [];

    public function like($field, $value)
    {
        $this->likeCalls[] = [$field, $value];
        return $this;
    }
}

require __DIR__ . '/../app/models/Assistant_conversation_model.php';

function assistant_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$assistantTools = (new ReflectionClass('Assistant_tools'))->newInstanceWithoutConstructor();
$definitionsMethod = new ReflectionMethod('Assistant_tools', 'build_definitions');
$definitionsMethod->setAccessible(true);
$toolDefinitions = $definitionsMethod->invoke($assistantTools);
$confirmationProperties = $toolDefinitions['confirm_action']['parameters']['properties'];
assistant_assert(
    is_object($confirmationProperties) && json_encode($confirmationProperties) === '{}',
    'The no-argument confirm_action schema must encode properties as an empty JSON object.'
);
$likeMethod = new ReflectionMethod('Assistant_tools', 'like');
$likeMethod->setAccessible(true);
$query = new AssistantTestQuery();
$likeMethod->invoke($assistantTools, $query, 'users.full_name', 'Maria Santos');
assistant_assert(
    $query->likeCalls === [['LOWER(users.full_name)', '%maria santos%']],
    'Case-insensitive partial matching must use LavaLust query builder like(), not where().'
);
$rememberMethod = new ReflectionMethod('Assistant_tools', 'remember_verified_records');
$rememberMethod->setAccessible(true);
$rememberMethod->invoke($assistantTools, 'get_bills', [
    'found' => true,
    'records' => [['id' => 41]],
]);
$verifiedRecordsProperty = new ReflectionProperty('Assistant_tools', 'verifiedRecords');
$verifiedRecordsProperty->setAccessible(true);
$verifiedRecords = $verifiedRecordsProperty->getValue($assistantTools);
assistant_assert(
    !empty($verifiedRecords['bills'][41]),
    'Verified bill records were not indexed for later ownership-safe writes.'
);

$gemini = new ScriptedGemini();
$gemini->responses = [
    ['parts' => [[
        'functionCall' => [
            'name' => 'lookup_rental_records',
            'args' => ['question' => 'list vacant units'],
        ],
    ]]],
    ['parts' => [['text' => 'Property Y has seven vacant units, Mark.']]],
    ['parts' => [[
        'functionCall' => [
            'name' => 'suggest_user_replies',
            'args' => ['suggestions' => ['List units in Property Y', 'Show active tenants']],
        ],
    ]]],
];
$result = $gemini->rental_assistant(
    [['role' => 'user', 'content' => 'List those.']],
    static function () {
        return 'Found 7 vacant units at Property Y: Y-101, Y-102.';
    },
    'Mark'
);
assistant_assert(count($gemini->calls) === 3, 'Gemini did not generate follow-up suggestions after the record lookup.');
assistant_assert(
    count(array_filter($gemini->calls, static function ($call) {
        return $call['timeoutSeconds'] < 1 || $call['timeoutSeconds'] > 35;
    })) === 0,
    'Assistant Gemini calls did not stay within the response budget.'
);
$secondCallContents = $gemini->calls[1]['contents'];
$functionResult = end($secondCallContents);
assistant_assert(
    ($functionResult['parts'][0]['functionResponse']['response']['result'] ?? null)
        === 'Found 7 vacant units at Property Y: Y-101, Y-102.',
    'The matching record result was not sent back to Gemini for its answer.'
);
assistant_assert($result['reply'] === 'Property Y has seven vacant units, Mark.', 'Gemini plain-text reply was not preserved.');
assistant_assert(
    $result['record_lookup'] === true
        && $result['proposal'] === null
        && $result['suggestions'] === ['List units in Property Y', 'Show active tenants'],
    'Lookup metadata or Gemini-generated suggestions were not preserved.'
);
assistant_assert(
    end($gemini->calls[2]['contents'])['role'] === 'user',
    'The suggestions request must end with a user turn, not a model turn.'
);
assistant_assert(
    strpos($gemini->calls[0]['instructions'], date('Y-m-d')) !== false
        && strpos($gemini->calls[0]['instructions'], 'pass both month and year to get_bills') !== false,
    'Gemini was not given the server date and current-month billing instruction.'
);
assistant_assert(
    !isset($gemini->calls[0]['contents'][0]['generationConfig']['responseMimeType']),
    'Normal conversational replies are still forced into JSON mode.'
);

$typedToolGemini = new ScriptedGemini();
$typedToolGemini->responses = [
    ['role' => 'model', 'parts' => [[
        'functionCall' => [
            'name' => 'search_units',
            'args' => [],
            'thoughtSignature' => 'preserve-this-signature',
        ],
    ]]],
    ['role' => 'model', 'parts' => [['text' => 'No records matched.']]],
    ['role' => 'model', 'parts' => [[
        'functionCall' => [
            'name' => 'suggest_user_replies',
            'args' => ['suggestions' => ['Show occupied units', 'Search another property']],
        ],
    ]]],
];
$dispatchedTool = null;
$typedResult = $typedToolGemini->rental_assistant(
    [['role' => 'user', 'content' => 'Which units are vacant?']],
    static function ($name, array $args) use (&$dispatchedTool) {
        $dispatchedTool = [$name, $args];
        return ['found' => false, 'message' => 'No records matched'];
    },
    '',
    [[
        'name' => 'search_units',
        'description' => 'Search units by typed occupancy and property filters.',
        'parameters' => ['type' => 'OBJECT', 'properties' => [], 'required' => []],
    ]]
);
$returnedModelTurn = $typedToolGemini->calls[1]['contents'][1];
$typedFunctionResponse = end($typedToolGemini->calls[1]['contents']);
assistant_assert(
    $dispatchedTool === ['search_units', []]
        && isset($typedToolGemini->calls[0]['tools'][0]['functionDeclarations'][4])
        && $returnedModelTurn['parts'][0]['functionCall']['thoughtSignature'] === 'preserve-this-signature'
        && is_object($returnedModelTurn['parts'][0]['functionCall']['args'])
        && strpos(json_encode($typedFunctionResponse), '"found":false') !== false
        && $typedResult['record_lookup'] === true,
    'Typed tool dispatch did not preserve the model turn/signature, empty object args, or structured result.'
);

$limitedToolGemini = new ScriptedGemini();
for ($i = 0; $i < 6; $i++) {
    $limitedToolGemini->responses[] = ['role' => 'model', 'parts' => [[
        'functionCall' => ['name' => 'search_properties', 'args' => (object) []],
    ]]];
}
$dispatchCount = 0;
try {
    $limitedToolGemini->rental_assistant(
        [['role' => 'user', 'content' => 'Search properties']],
        static function () use (&$dispatchCount) {
            $dispatchCount++;
            return [];
        }
    );
    assistant_assert(false, 'The assistant accepted more than five tool-loop iterations.');
} catch (RuntimeException $e) {
    assistant_assert(
        strpos($e->getMessage(), 'too many tools') !== false
            && $dispatchCount === 5
            && count($limitedToolGemini->calls) === 6
            && strpos(json_encode($limitedToolGemini->calls[1]['contents']), '"response":{}') !== false,
        'The tool loop did not stop after five iterations or encode an empty function response as an object.'
    );
}

$recordSuggestionGemini = new ScriptedGemini();
$recordSuggestionGemini->responses = [
    ['parts' => [[
        'functionCall' => [
            'name' => 'lookup_rental_records',
            'args' => ['question' => 'Show my properties'],
        ],
    ]]],
    ['parts' => [['text' => 'You have five properties in your account.']]],
    ['parts' => [[
        'functionCall' => [
            'name' => 'suggest_user_replies',
            'args' => ['suggestions' => ['Show vacant units', 'List active tenants']],
        ],
    ]]],
];
$recordSuggestionResult = $recordSuggestionGemini->rental_assistant(
    [['role' => 'user', 'content' => 'Show me all my properties']],
    static function () {
        return 'Found 5 property records: Aldaba Movers, Mark, Property X, Property Y, Rentako BH.';
    },
    'Mark'
);
assistant_assert(
    $recordSuggestionResult['reply'] === 'You have five properties in your account.'
        && $recordSuggestionResult['suggestions'] === ['Show vacant units', 'List active tenants']
        && count($recordSuggestionGemini->calls) === 3,
    'Record answers without a question did not request Gemini-generated follow-up suggestions.'
);
assistant_assert(
    strpos(json_encode($recordSuggestionGemini->calls[2]['contents']), 'Found 5 property records') !== false,
    'Gemini follow-up suggestions were not grounded in the database lookup result.'
);

$conversationModel = (new ReflectionClass('Assistant_conversation_model'))->newInstanceWithoutConstructor();
$contextMethod = new ReflectionMethod('Assistant_conversation_model', 'without_database_answers');
$contextMethod->setAccessible(true);
$draftContext = $contextMethod->invoke($conversationModel, [
    ['role' => 'assistant', 'content' => 'First draft is ready.', 'proposal_json' => json_encode([
        'property' => ['name' => 'First property'],
        'units' => [['unit_name' => 'Unit 1']],
        'tenants' => [],
    ])],
    ['role' => 'assistant', 'content' => 'The current draft is ready.', 'proposal_json' => json_encode([
        'kind' => 'contract_draft',
        'clauses' => [['title' => 'Quiet hours', 'text' => 'Keep noise low.']],
        'rules' => [],
        'utilities' => [],
        'notices' => [],
    ])],
]);
assistant_assert(
    strpos(end($draftContext)['content'], 'Current unsaved draft data for revision') !== false
        && strpos(end($draftContext)['content'], 'Quiet hours') !== false
        && strpos($draftContext[0]['content'], 'Current unsaved draft data for revision') === false,
    'The latest reviewable draft was not preserved as model context for follow-up edits.'
);

$suggestionGemini = new ScriptedGemini();
$suggestionGemini->responses = [
    ['parts' => [[
        'functionCall' => [
            'name' => 'suggest_user_replies',
            'args' => ['suggestions' => ['Apartment', 'Boarding house']],
        ],
    ]]],
    ['parts' => [['text' => 'What type of rental property are you setting up?']]],
];
$suggestionResult = $suggestionGemini->rental_assistant(
    [['role' => 'user', 'content' => 'I want to add a property.']],
    static function () {
        return 'No record lookup needed.';
    },
    'Mark'
);
assistant_assert(
    $suggestionResult['suggestions'] === ['Apartment', 'Boarding house']
        && count($suggestionGemini->calls) === 2,
    'Contextual reply suggestions were not returned after Gemini asked its question.'
);
assistant_assert(
    strpos($suggestionGemini->calls[0]['instructions'], 'MUST also call suggest_user_replies') !== false,
    'Gemini was not instructed to suggest replies whenever it asks the landlord a question.'
);

$forcedSuggestionGemini = new ScriptedGemini();
$forcedSuggestionGemini->responses = [
    ['parts' => [['text' => 'Would you like to check your current rentals or add a new property?']]],
    ['parts' => [[
        'functionCall' => [
            'name' => 'suggest_user_replies',
            'args' => ['suggestions' => ['Check my rentals', 'Help me add a property']],
        ],
    ]]],
];
$forcedSuggestionResult = $forcedSuggestionGemini->rental_assistant(
    [['role' => 'user', 'content' => 'hi']],
    static function () {
        return 'No record lookup needed.';
    },
    'Mark'
);
assistant_assert(
    $forcedSuggestionResult['reply'] === 'Would you like to check your current rentals or add a new property?'
        && $forcedSuggestionResult['suggestions'] === ['Check my rentals', 'Help me add a property']
        && $forcedSuggestionGemini->calls[1]['functionCallingMode'] === 'ANY'
        && count($forcedSuggestionGemini->calls[1]['tools'][0]['functionDeclarations']) === 1,
    'A question without initial suggestions did not trigger a Gemini-only suggestion call.'
);

$optionalSuggestionGemini = new ScriptedGemini();
$optionalSuggestionGemini->responses = [
    ['parts' => [['text' => 'Would you like help with a property?']]],
    ['throw' => 'Suggestion generation failed.'],
];
$optionalSuggestionResult = $optionalSuggestionGemini->rental_assistant(
    [['role' => 'user', 'content' => 'hi']],
    static function () {
        return 'No record lookup needed.';
    },
    'Mark'
);
assistant_assert(
    $optionalSuggestionResult['reply'] === 'Would you like help with a property?'
        && $optionalSuggestionResult['suggestions'] === ['Show my properties', 'List my units', 'Help me add a property'],
    'A suggestion-only Gemini failure did not fall back to relevant property actions.'
);

$contextualFallbackGemini = new ScriptedGemini();
$contextualFallbackGemini->responses = [
    ['parts' => [['text' => 'Aww, thank you! What can I assist with today? We can check some records, draft a house rule, or look into something else entirely.']]],
    ['throw' => 'Suggestion generation failed.'],
];
$contextualFallbackResult = $contextualFallbackGemini->rental_assistant(
    [['role' => 'user', 'content' => 'you look good']],
    static function () {
        return 'No record lookup needed.';
    },
    'Mark'
);
assistant_assert(
    $contextualFallbackResult['suggestions'] === ['Check some records', 'Draft a house rule', 'Look into something else entirely'],
    'The fallback did not reuse the assistant reply’s offered choices: '
        . json_encode($contextualFallbackResult['suggestions'])
);

$jsonSuggestionGemini = new ScriptedGemini();
$jsonSuggestionGemini->responses = [
    ['parts' => [['text' => json_encode([
        'reply' => 'Would you like to look at your properties or units?',
        'suggestions' => ['Ilan ang vacant units ko?', 'Anong mga property ang mayroon ako?'],
    ])]]],
];
$jsonSuggestionResult = $jsonSuggestionGemini->rental_assistant(
    [['role' => 'user', 'content' => 'hi']],
    static function () {
        return 'No record lookup needed.';
    },
    'Mark'
);
assistant_assert(
    $jsonSuggestionResult['suggestions'] === ['Ilan ang vacant units ko?', 'Anong mga property ang mayroon ako?']
        && $jsonSuggestionResult['reply'] === 'Would you like to look at your properties or units?',
    'JSON-formatted suggestions were exposed as the assistant reply instead of being extracted.'
);

$assistantTools = (new ReflectionClass('Assistant_tools'))->newInstanceWithoutConstructor();
$definitionsMethod = new ReflectionMethod('Assistant_tools', 'build_definitions');
$definitionsMethod->setAccessible(true);
$toolDefinitions = $definitionsMethod->invoke($assistantTools);
$requiredToolNames = [
    'search_properties', 'search_units', 'search_tenants', 'get_bills', 'get_payments',
    'get_tenant_balance', 'get_overdue_summary', 'get_maintenance_requests', 'get_move_requests',
    'get_leases', 'get_chat_history', 'add_tenant', 'create_bill', 'record_payment',
    'update_bill', 'update_unit', 'update_property', 'delete_unit', 'delete_bill', 'confirm_action',
];
$confirmationParameters = $toolDefinitions['confirm_action']['parameters'];
$confirmationMethod = new ReflectionMethod('Assistant_tools', 'is_explicit_confirmation');
$confirmationMethod->setAccessible(true);
assistant_assert(
    count(array_diff($requiredToolNames, array_keys($toolDefinitions))) === 0
        && !in_array('landlord_id', array_keys($toolDefinitions['search_properties']['parameters']['properties']), true)
        && empty($confirmationParameters['required'])
        && $confirmationMethod->invoke($assistantTools, 'yes') === true
        && $confirmationMethod->invoke($assistantTools, 'no') === false,
    'Typed tools omitted a required operation, accepted landlord identity, or weakened backend confirmation.'
);

echo "Assistant regression checks passed.\n";
