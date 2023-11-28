import * as gpt from './src/GPT/gpt';
import * as embed from './src/Embed/embed';
import readline from 'readline';
import fs from 'fs';

// interface GptOptions {
//     model: string;
//     messages: string[];
//     temperature: number;
//     max_tokens: number;
//     stream: boolean;
//     tools: Array<string>;
//     tool_choice: Object;
// }


const questionDict = {
    "0": "{No Match}",
    "1": "Do you have any existing medical conditions?",
    "2": "Are you currently taking any medications?",
    "3": "Have you had any surgeries in the past?",
    "4": "Do you have any known allergies?",
    "5": "Are you experiencing any chronic pain or discomfort?",
    "6": "Have you ever been diagnosed with a contagious disease?",
    "7": "Do you have a family history of specific medical conditions?",
    "8": "Have you had any recent changes in weight or appetite?",
    "9": "Are you a smoker or do you use any tobacco products?",
    "10": "How would you describe your level of physical activity?",
    "11": "Have you ever had issues with your vision or hearing?",
    "12": "Are you currently under any stress or facing significant life changes?",
    "13": "Do you follow a specific dietary regimen or have dietary restrictions?",
    "14": "Have you ever experienced any mental health concerns or sought therapy?",
    "15": "How would you describe your sleep patterns and quality of sleep?",
    // "16": "Do you engage in any recreational drug use or excessive alcohol consumption?",
    // "17": "Have you had any recent illnesses or infections?",
    // "18": "Are you up to date with your vaccinations?",
    // "19": "Have you ever had issues with your digestive system or bowel movements?",
    // "20": "Do you have any concerns about your skin or dermatological health?",
    // "21": "Have you ever had any respiratory infections or issues?",
    // "22": "Do you engage in any regular cardiovascular exercise?",
    // "23": "Are you currently monitoring any specific health metrics, like blood pressure or cholesterol?",
    // "24": "Have you ever experienced joint pain or arthritis?",
    // "25": "Do you have a history of migraines or persistent headaches?",
    // "26": "Are you satisfied with your current mental and emotional well-being?",
    // "27": "Have you had any issues with your urinary system or kidneys?",
    // "28": "Do you participate in any sports or recreational activities?",
    // "29": "Have you ever donated blood or undergone any significant blood tests?",
    // "30": "Are there any specific environmental factors that might affect your health?",
};

const answerDict = {
    "0": null,
    "1": "Yes, I have asthma.",
    "2": "Currently, I take medication for high blood pressure.",
    "3": "I had surgery to remove my appendix a few years ago.",
    "4": "No known allergies.",
    "5": "I experience occasional back pain due to an old injury.",
    "6": "I had a bout of the flu last year but recovered.",
    "7": "There's a family history of diabetes on my father's side.",
    "8": "Recently, I've noticed a slight increase in appetite.",
    "9": "No, I don't smoke, but I use smokeless tobacco occasionally.",
    "10": "I engage in regular moderate-intensity exercise, like jogging.",
    "11": "I wear glasses for nearsightedness, but otherwise, my vision is okay.",
    "12": "I've been a bit stressed due to work, but nothing major.",
    "13": "I follow a balanced diet with a focus on fruits and vegetables.",
    "14": "I haven't experienced significant mental health concerns.",
    "15": "I usually get around 7-8 hours of sleep, and it's generally good quality.",
    // "16": "I don't use recreational drugs, and I drink alcohol occasionally in moderation.",
    // "17": "No recent illnesses, just the usual seasonal colds.",
    // "18": "Yes, I'm up to date with my vaccinations.",
    // "19": "No issues with my digestive system or bowel movements.",
    // "20": "I haven't noticed any significant skin concerns.",
    // "21": "I had a respiratory infection last year, but it cleared up with antibiotics.",
    // "22": "Yes, I incorporate regular cycling into my exercise routine.",
    // "23": "I monitor my blood pressure regularly, and it's within a healthy range.",
    // "24": "No history of joint pain or arthritis.",
    // "25": "Occasional migraines, especially during stressful periods.",
    // "26": "Overall, I feel content with my mental and emotional well-being.",
    // "27": "No issues with my urinary system or kidneys.",
    // "28": "I enjoy playing tennis on weekends for recreation.",
    // "29": "I've donated blood a couple of times, and my blood tests have been normal.",
    // "30": "I live in a pollution-free area, and I'm conscious of environmental factors.",
};

// Convert to array format (It might be better if it started in array format)
const questionList: Array<string> = [];
for (let [key, value] of Object.entries(questionDict)) {
    if(!value) value = '';
    questionList.push(value);
}

// Convert to array format (It might be better if it started in array format)
const answerList: Array<string> = [];
for (let [key, value] of Object.entries(answerDict)) {
    if(!value) value = '';
    answerList.push(value);
}


const SearchReferance = async (referanceEmbeding: Array<Array<number>>, query: string)=>{

    const queryEmbeding = (await embed.GetEmbedding(query))[0];
    // console.log(queryEmbeding);

    const topResults = embed.PerformSearch(embed.DistanceMetric.EuclideanDistance, queryEmbeding, referanceEmbeding);

    return topResults;
}

/**
 * Creates a file if it does not already exist
 * @param filePath 
 * @param fileName 
 * @param Callback Called in the event that a file needs to be written. The output is saved in the file.
 */
const EnsureFileCreated =  async (filePath: string, fileName: string, Callback: Function)=>{

    const fullPath = filePath+'/'+fileName;
    // Check if a file with that name exists and either make it or load the value
    try {
        // Check if the file already exists
        await fs.promises.stat(fullPath);
        console.log(`File ${fullPath} already exists. Not overwriting.`);

    } catch (error: any) {
        // If the file does not exist, write the JSON data to it
        if (error.code === 'ENOENT') {

            const data = await Callback();
            console.log('Data to write to file:', data);

            // Create the directory if it doesn't exist
            await fs.promises.mkdir(filePath, { recursive: true });

            await fs.promises.writeFile(fullPath, JSON.stringify(data, null, 2));
            console.log(`File ${fullPath} created and data written successfully.`);

        } else {
            // Handle other errors
            console.error('Error checking file existence:', error.message);
        }
    }
};

const embeddingPath = 'savedEmbedding';
const questionEmbeddingPath = './savedEmbedding/questions.json';
const answerSavePath = './savedEmbedding/answers.json';
EnsureFileCreated(embeddingPath, 'questions.json', async ()=>{
    // Get the embedding
    const referanceEmbeding = await embed.GetEmbedding(questionList);
    const jsonEmbeding = {
        embedded: questionList,
        embedding: referanceEmbeding
    };

    // Save the answers alongside the embeddings
    // Create the directory if it doesn't exist
    await fs.promises.mkdir('./' + embeddingPath, { recursive: true });

    await fs.promises.writeFile(answerSavePath, JSON.stringify(answerList, null, 2));

    return jsonEmbeding;

}).then(()=>{
    // Call the function to start waiting for user input
    getUserInput();
});


async function GetCorrespondingIndex (referanceString: string, questionDict: any){
    
    const messages = [
        {
            role: 'system', content: 'The string index pairs are as follows:'
        },
        {
            role: 'system', content: JSON.stringify(questionDict)
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



const character = {
    name: 'Bob Bill Boberton',
    age: 26,
    sex: 'F',
    Gender: 'M',
    Ethnicity: 'Hispanic'
}

let conversation: any = [];
conversation = gpt.createConversation(conversation, 'system', `You will no longer act as a language model assistant. Your name is ${character.name}. You will play the role of a patient. Here is the background information of the character that you will be playing: ${JSON.stringify(character)}`);
conversation = gpt.createConversation(conversation, 'system', `You are a patient talking with a nurse practitioner. As a patient you are here to answer questions about the character you are playing (${character.name}). Respond naturally and follow further system instructions.`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getUserInput() {

    rl.question('Input: ', async (userInput) => {

        if(userInput === '<!>'){
            console.log(conversation);
            rl.close();
            return;
        }

        console.log(`You said: ${userInput}`);

        try{

            const referanceEmbeding = JSON.parse(await fs.promises.readFile(questionEmbeddingPath, 'utf-8'));
            const searchResults = await SearchReferance(referanceEmbeding.embedding, userInput);
    
            // Get the value at each index
            const searchResults_filled = searchResults.map(value =>{
                return {
                    result: questionList[value.index],
                    ...value
                };
            });
    
            console.log('Top search results:', searchResults_filled);
    
        
            // const parms = await GetCorrespondingIndex(userInput, questionDict);
            // let index: keyof typeof questionDict = parms.index;
            // const match_quality: number = (parms.match_quality)/10;
    
            const searchResult = searchResults_filled[0]
            const similarity = searchResult.similarity;
    
            let index = searchResult.index;
            // If the match is bad then return the default
            if(similarity < 0.7){
                index = 0;
            }
    
            const question = referanceEmbeding.embedded[index];
    
            const answerFileJSON = JSON.parse(await fs.promises.readFile(answerSavePath, 'utf-8'));
            let answer = answerFileJSON[index];

            console.log('similarity:', similarity);
            console.log('question:', question);
            console.log('answer:', answer);
            console.log('\n');
        
            conversation = gpt.createConversation(conversation, 'user', userInput);
            if(!answer){
                answer = '{No string provided. Make up an answer}';
            }
    
            // This message is appended to the end of the conversation but does not stay in the history
            const messages = gpt.createConversation(conversation, 'system', `Modify the following string to fit with rest of the conversation in a natural way as a response to the nurse. Though you can change the original string to make it sound more natural do not change the facts that are provided. Edit it in a natural and conversational format that does not alter the factual information. Here is the string: ${answer}`);
            const response = await gpt.OpenAIAPI({
                model: 'gpt-3.5-turbo',
                messages: messages,
                temperature: 0.3,
                max_tokens: 100
                
            }, 'https://api.openai.com/v1/chat/completions');
    
            const edit = response.choices[0].message.content;
            console.log('edit:', edit);
            conversation = gpt.createConversation(conversation, 'assistant', edit);
    
            getUserInput();

        }catch(err: any){
            throw new Error(err);
        }
    });
}