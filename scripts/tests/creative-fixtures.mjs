// Shared, valid agent-output fixtures for the social/LinkedIn schema tests (not a test file itself).

export const socialStrategy = {
  event_type: "Birthday Parties",
  persona: "someone planning a birthday for a close friend",
  desire: "belonging",
  awareness_level: "Problem aware",          // normalised to problem_aware
  objective: "awareness",
  angle: "Your living room can't hold the birthday you're picturing",
  framework: "bab",
  levers: ["intensification", "identity"],
  hook_candidates: [
    { hook_type: "pov", line: "POV: the birthday finally has room to breathe", score: 4 },
    { hook_type: "question", line: "Still squeezing birthdays into your living room?", score: 5 },
    { hook_type: "number_list", line: "3 signs your party needs a real space", score: 3 },
    { hook_type: "callout", line: "If you're planning a friend's birthday, watch this", score: 3 },
  ],
  hook: { hook_type: "question", visual: "camera already gliding past a sunlit table set with a cake", line: "Still squeezing birthdays into your living room? Try floor-to-ceiling windows." },
  payoff: "The room fills with friends around the long table, with space to spare",
};

export const linkedinStrategy = {
  ...socialStrategy,
  event_type: "Workshops",
  persona: "a facilitator running a hands-on session",
  desire: "control",
  framework: "educator",
  levers: ["reciprocity"],
  hook_candidates: [
    { hook_type: "question", line: "Where does your next workshop actually happen?", score: 4 },
    { hook_type: "teach", line: "The room shapes the workshop more than the slides", score: 5 },
    { hook_type: "mistake", line: "Most workshops lose energy before lunch", score: 3 },
    { hook_type: "callout", line: "Facilitators: this one is for you", score: 3 },
  ],
  hook: { hook_type: "teach", visual: "", line: "The room shapes the workshop more than the slides" },
  payoff: "Three concrete things to look for in a workshop room, and where to find one",
};

export const videoShot = (over = {}) => ({
  rig: "gimbal operator walking slowly",
  framing: "horizon level, eye height",
  beats: [
    { start_s: 0, end_s: 3, camera_move: "dolly-in", camera_detail: "already moving on frame one", action: "a hand sets a cake down on the long table" },
    { start_s: 3, end_s: 15, camera_move: "slider", camera_detail: "slow, constant", action: "sunlight from the window slides across the table as chairs are pulled out" },
    { start_s: 15, end_s: 30, camera_move: "static", camera_detail: "locked frame, hold", action: "background guests gather and raise glasses", people: "background_guests" },
  ],
  subject: "the long wooden table in the main room",
  environment: "the bright loft from the reference photos, late afternoon",
  light: "window light from the left, warm",
  style: "documentary realism",
  sound: "warm room ambience and a light acoustic track",
  voice: { mood: "friendly", delivery: "a smile on the hook" },
  narration: "Still squeezing birthdays into your living room? Step into this loft instead. Floor-to-ceiling windows pour afternoon light across a long wooden table, exposed brick runs the length of the room, and the polished concrete floor leaves space for everyone to gather. It's made for celebrations that need room to breathe. Find it on Kangrooo and book your date.",
  ...over,
});

export const spaceDetails = ["floor-to-ceiling windows", "long wooden table", "exposed brick wall", "polished concrete floor"];

export const imagePost = {
  space_details: spaceDetails,
  content_type: "image", caption: "A bright corner for your next gathering", hashtags: ["#Venue", "toronto events"],
  strategy: socialStrategy, people: "none",
  image: { visual_prompt: "warm daylight loft, portrait" }, video: null,
};

export const videoPost = (shot = videoShot(), extra = {}) => ({
  space_details: spaceDetails,
  content_type: "video", caption: "Hello", hashtags: [], strategy: socialStrategy, people: "background_guests",
  image: null, video: { format_reason: "motion suits a gathering", shot }, ...extra,
});

export const linkedinPost = (over = {}) => ({
  strategy: linkedinStrategy, people: "none",
  post_text: "Hosting a client workshop? The right room sets the tone.", hashtags: ["Events"],
  image: { visual_prompt: "clean meeting room, square", hook: { headline: "Meetings that feel different" } },
  ...over,
});
