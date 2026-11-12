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
    { start_s: 3, end_s: 9, camera_move: "slider", camera_detail: "slow, constant", action: "sunlight from the window slides across the table as chairs are pulled out" },
    { start_s: 9, end_s: 15, camera_move: "static", camera_detail: "locked frame, hold", action: "background guests gather and raise glasses", people: "background_guests" },
    { start_s: 15, end_s: 21, camera_move: "pan", camera_detail: "slow, even", action: "afternoon light moves along the exposed brick wall" },
    { start_s: 21, end_s: 26, camera_move: "truck", camera_detail: "slow lateral move", action: "light settles across the polished concrete floor" },
    { start_s: 26, end_s: 30, camera_move: "static", camera_detail: "locked wide, hold", action: "the long table waits under the windows, set with the cake" },
  ],
  subject: "the long wooden table in the main room",
  environment: "the bright loft from the reference photos, late afternoon",
  light: "window light from the left, warm",
  style: "documentary realism",
  sound: "warm room ambience and a light acoustic track",
  voice: { mood: "friendly", delivery: "a smile on the hook" },
  narration: "Still squeezing birthdays into your living room? Step into this loft instead. Those floor-to-ceiling windows light up the long wooden table, the exposed brick runs the length of the room, and there's plenty of polished concrete floor for everyone. It's made for birthdays that need room to breathe. Book it on Kangrooo.",   // 52 words
  ...over,
});

/** One valid narration part per videoShot() beat (3, 6, 6, 6, 5, 4 s): 54 words, one flowing voice-over. */
export const shotLines = [
  "Still squeezing birthdays into your living room?",
  "Step inside — the floor-to-ceiling windows light up the long wooden table.",
  "Friends drift in, set their glasses down, find a seat by the cake.",
  "That exposed brick wall makes a real backdrop for photos.",
  "And there's polished concrete floor for dancing later.",
  "Book it on Kangrooo.",
];

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
