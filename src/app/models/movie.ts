export interface OpenAiMovieSuggestion {
  title: string;
  year?: number;
  genres?: string[];
  synopsis?: string;
  runtimeMinutes?: number;
  whereToWatch?: string[];
  watchReasons?: string[];
  moodFit?: string;
}

export interface DisplayMovie {
  title: string;
  year?: number;
  genres: string[];
  overview: string;
  runtime?: number;
  rating?: number;
  poster?: string;
  whereToWatch: string[];
  watchReasons: string[];
  source: 'openai';
}
