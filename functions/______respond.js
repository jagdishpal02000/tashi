const { Configuration, OpenAIApi } = require("openai");
const axios = require('axios');
const apiUrl = 'http://15.206.28.116:8000';
let openai;

exports.handler = async function(context, { request, SpeechResult }, callback) {
  
  const configuration = new Configuration({ apiKey: context.OPENAI_API_KEY });
  openai = new OpenAIApi(configuration);
  await axios(apiUrl + '/log/user-completed-speech-now');

  const twiml = new Twilio.twiml.VoiceResponse();
  const response = new Twilio.Response();

  const cookieValue = request.cookies.convo;
  const cookieData = cookieValue ? JSON.parse(decodeURIComponent(cookieValue)) : null;

  const voiceInput = SpeechResult;

  const conversation = cookieData?.conversation || [];
  conversation.push(`user: ${voiceInput}`);
  await axios(apiUrl + '/log/generating-ai-response');

  const aiResponse = await generateAIResponse(voiceInput);
  await axios(apiUrl + '/log/got-ai-response');
  
  const cleanedAiResponse = aiResponse.replace(/^\w+:\s*/i, "").trim();
  await axios(apiUrl + '/log/cleaning-ai-response');
  
  conversation.push(`assistant: ${aiResponse}`);
  
  while (conversation.length > 4) {
    conversation.shift();
  }
  
  axios(apiUrl + '/log/saying-the-ai-response');
  const twilioPromises = [
    twiml.say({ voice: "Polly.Raveena" }, cleanedAiResponse),
    twiml.redirect({ method: "POST" }, `/transcribe`)
  ];

  await Promise.all(twilioPromises);

  response.appendHeader("Content-Type", "application/xml");
  response.setBody(twiml.toString());

  const newCookieValue = encodeURIComponent(JSON.stringify({ conversation }));
  await response.setCookieAsync("convo", newCookieValue, { path: "/" });

  return callback(null, response);
};

async function generateAIResponse(input) {
  return await createCompletion(input);
}

async function createCompletion(prompt) {
  try {
    const completion = await openai.createCompletion({
      model: "gpt-3.5-turbo",
      prompt: formatConversation(prompt),
      max_tokens: 50,
      n: 3, // Number of completions to generate
    });

    if (completion.status === 500) {
      return handleApiError();
    }

    return completion.choices[0].text.trim();
  } catch (error) {
    if (error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT") {
      return handleTimeoutError();
    } else {
      console.error("Error during OpenAI API request:", error);
      throw error;
    }
  }
}

function formatConversation(prompt) {
  const systemMessage = { role: "system", content: "You are an AI Counselling therapy audio bot known as Riya and not a real therapist and you will speak more ask less questions. You are only a supportive audio bot." };
  const userMessage = { role: "user", content: `user: ${prompt}` };
  return [systemMessage, userMessage];
}

function handleApiError() {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Raveena" }, "Oops, looks like I got an error from the OpenAI API on that request. Let's try that again.");
  twiml.redirect({ method: "POST" }, `/transcribe`);
  return twiml.toString();
}

function handleTimeoutError() {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Raveena" }, "I'm sorry, but it's taking me a little bit too long to respond. Let's try that again, one more time.");
  twiml.redirect({ method: "POST" }, `/transcribe`);
  return twiml.toString();
}
