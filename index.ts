import * as gpt from './src/GPT/gpt';
import readline from 'readline';

// interface GptOptions {
//     model: string;
//     messages: string[];
//     temperature: number;
//     max_tokens: number;
//     stream: boolean;
//     tools: Array<string>;
//     tool_choice: Object;
// }


const questionList = {
    '0': '{No Match}',
    '1': 'Do you have any existing medical conditions?',
    '2': 'Are you currently taking any medications?',
    '3': 'Have you had any surgeries in the past?',
    '4': 'Do you have any known allergies?',
    '5': 'Are you experiencing any chronic pain or discomfort?',
    '6': 'Have you ever been diagnosed with a contagious disease?',
    '7': 'Do you have a family history of specific medical conditions?',
    '8': 'Have you had any recent changes in weight or appetite?',
    '9': 'Are you a smoker or do you use any tobacco products?',
    '10': 'How would you describe your level of physical activity?'
};

const answerList = {
    '0': null,
    '1': 'Yes, I have asthma.',
    '2': 'Currently, I take medication for high blood pressure.',
    '3': 'I had surgery to remove my appendix a few years ago.',
    '4': 'No known allergies.',
    '5': 'I experience occasional back pain due to an old injury.',
    '6': 'I had a bout of the flu last year but recovered.',
    '7': 'There\'s a family history of diabetes on my father\'s side.',
    '8': 'Recently, I\'ve noticed a slight increase in appetite.',
    '9': 'No, I don\'t smoke, but I use smokeless tobacco occasionally.',
    '10': 'I engage in regular moderate-intensity exercise, like jogging.'
  };

async function GetCorrespondingIndex (referanceString: string, questionList: any){
    
    const messages = [
        {
            role: 'system', content: 'The string index pairs are as follows:'
        },
        {
            role: 'system', content: JSON.stringify(questionList)
        },
        {
            role: 'system', content: 'The referance string is:' + referanceString
        }
    ];

    const tools = [{
        "type": "function",
        "function": {
            "name": "Get_Index_of_Corresponding_String",
            "description": "Returns the index of the string that corresponds to the referance.",
            "parameters": {
            "type": "object",
            "properties": {
                "index": {
                "type": "number",
                "description": "The index of the string that is most similar in meaning to the referance string."
                },
                "match_quality": {
                    "type": "number",
                    "description": "0 to 10 ranking of how close the match is with referance string. With 0 being a bad match and 10 being a good one."
                    }
            },
            "required": ["index", "match_quality"]
            }
        }
    }];

    const response = await gpt.OpenAIAPI({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0,
        max_tokens: 100,
        stream: false,
        tools: tools,
        tool_choice: {type: "function", "function": {"name": "Get_Index_of_Corresponding_String"}}
        
    }, 'https://api.openai.com/v1/chat/completions');
    
    const parms = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
    return parms;
};




let conversation: any = [];
conversation = gpt.createConversation(conversation, 'system', 'Take the role of a patient in a practice for a nurse practitioner. Respond naturally and follow further system instructions.');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getUserInput() {

    rl.question('Input: ', async (userInput) => {

        if(userInput === '<!>'){
            rl.close();
            return;
        }

        console.log(`You said: ${userInput}`);
    
        const parms = await GetCorrespondingIndex(userInput, questionList);
        const index: keyof typeof questionList = parms.index;
        const match_quality: number = parms.match_quality;
        const question = questionList[index];
        const answer = answerList[index];
        console.log('conf:', match_quality);
        console.log('q:', question);
        console.log('a:', answerList[index]);
    
        
        conversation = gpt.createConversation(conversation, 'user', userInput);
        const messages = gpt.createConversation(conversation, 'system', 'Modify the following string to fit with rest of the conversation in a natural way as a response to the user. Do not change the informational content of the string. Respond with only the modified content. Do not add extra details that were not provided. Here is the string: ');
        const response = await gpt.OpenAIAPI({
            model: 'gpt-3.5-turbo',
            messages: messages,
            temperature: 0,
            max_tokens: 100
            
        }, 'https://api.openai.com/v1/chat/completions');

        const edit = response.choices[0].message.content;
        console.log('e:', edit);
        conversation = gpt.createConversation(conversation, 'assistant', edit);

        getUserInput();
    });
}

// Call the function to start waiting for user input
getUserInput();