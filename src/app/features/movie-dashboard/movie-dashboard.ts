import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { DisplayMovie, OpenAiMovieSuggestion } from '../../models/movie';
import { environment } from '@env/environment';
import { OpenAiError, OpenAiService } from 'app/services/openai.service';

const OPENAI_API_KEY = environment.openAiApiKey ?? '';

@Component({
  selector: 'app-movie-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './movie-dashboard.html',
  styleUrl: './movie-dashboard.css',
})
export class MovieDashboardComponent {
  private readonly openAiService = inject(OpenAiService);

  private activeRequest: AbortController | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  protected readonly moods = [
    'Energetic',
    'High-Octane Action',
    'Mind-Bending',
    'Calm & Cozy',
    'Family Night',
    'Sci-Fi Escape',
    'Nostalgic',
  ];

  protected readonly searchTerm = signal('');
  protected readonly selectedMood = signal<string | null>(null);

  protected readonly aiStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly aiError = signal<string | null>(null);
  protected readonly aiSuggestions = signal<OpenAiMovieSuggestion[]>([]);

  protected readonly displayMovies = computed<DisplayMovie[]>(() =>
    this.aiSuggestions().map((suggestion) => this.toDisplayFromSuggestion(suggestion))
  );
  protected readonly highlight = computed(() => this.displayMovies()[0] ?? null);
  protected readonly supportingMovies = computed(() => this.displayMovies().slice(1));
  protected readonly isUsingOpenAi = computed(() => this.displayMovies().length > 0);

  private readonly aiPrompt = computed(() => {
    const query = this.searchTerm().trim();
    if (query.length < 2) {
      return '';
    }

    const mood = this.selectedMood();
    const promptParts = [
      `Suggest up to five distinct movies that match this request: "${query}".`,
      'Only return widely recommended, high-quality titles and include a concise synopsis when possible.',
    ];

    if (mood) {
      promptParts.push(`Every title should feel like the mood "${mood}".`);
    }

    promptParts.push('Respond strictly using the provided JSON schema.');
    return promptParts.join(' ');
  });

  private readonly aiEffect = effect(() => {
    const prompt = this.aiPrompt();
    this.scheduleAiFetch(prompt);
  });

  protected updateSearch(term: string) {
    this.searchTerm.set(term);
  }

  protected updateMood(mood: string) {
    this.selectedMood.update((current) => (current === mood ? null : mood));
  }

  protected clearSearch() {
    this.searchTerm.set('');
    this.aiSuggestions.set([]);
    this.aiStatus.set('idle');
    this.aiError.set(null);
    this.cancelActiveRequest();
  }

  private scheduleAiFetch(prompt: string) {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }

    const key = OPENAI_API_KEY.trim();
    const query = this.searchTerm().trim();

    if (!query) {
      this.aiSuggestions.set([]);
      this.aiStatus.set('idle');
      this.aiError.set(null);
      this.cancelActiveRequest();
      return;
    }

    if (!key) {
      this.aiStatus.set('error');
      this.aiError.set('Please provide a valid OpenAI key in the OPENAI_API_KEY constant.');
      this.aiSuggestions.set([]);
      this.cancelActiveRequest();
      return;
    }

    if (!prompt) {
      return;
    }

    this.debounceHandle = setTimeout(() => this.runOpenAi(prompt, key), 600);
  }

  private runOpenAi(prompt: string, apiKey: string) {
    this.cancelActiveRequest();

    this.aiStatus.set('loading');
    this.aiError.set(null);

    const controller = new AbortController();
    this.activeRequest = controller;

    this.openAiService
      .suggestMovies(prompt, apiKey, controller.signal)
      .then((suggestions) => {
        if (this.activeRequest !== controller) {
          return;
        }
        this.aiSuggestions.set(suggestions);
        this.aiStatus.set(suggestions.length ? 'ready' : 'idle');
        if (!suggestions.length) {
          this.aiError.set('No results matched this prompt. Try expanding your description.');
        }
      })
      .catch((error: unknown) => {
        if (this.activeRequest !== controller) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        this.aiStatus.set('error');
        let message = 'Something went wrong while fetching OpenAI suggestions.';
        if (error instanceof OpenAiError) {
          if (error.code === 'insufficient_quota') {
            message =
              'Your OpenAI key has no remaining quota. Please review your plan or switch keys.';
          } else {
            message = error.message;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }
        this.aiError.set(message);
        this.aiSuggestions.set([]);
      })
      .finally(() => {
        if (this.activeRequest === controller) {
          this.activeRequest = null;
        }
      });
  }

  private cancelActiveRequest() {
    if (this.activeRequest) {
      this.activeRequest.abort();
      this.activeRequest = null;
    }
  }

  private toDisplayFromSuggestion(suggestion: OpenAiMovieSuggestion): DisplayMovie {
    return {
      title: suggestion.title,
      year: suggestion.year,
      genres: suggestion.genres ?? [],
      overview:
        suggestion.synopsis ??
        (suggestion.watchReasons ? suggestion.watchReasons.join(' ') : 'No synopsis provided.'),
      runtime: suggestion.runtimeMinutes,
      whereToWatch: suggestion.whereToWatch ?? [],
      watchReasons: suggestion.watchReasons ?? (suggestion.moodFit ? [suggestion.moodFit] : []),
      source: 'openai',
    };
  }

  protected formatMeta(movie: DisplayMovie): string {
    const parts: string[] = [];
    if (movie.year) {
      parts.push(String(movie.year));
    }
    if (movie.genres.length) {
      parts.push(movie.genres.join(' / '));
    }
    if (movie.runtime) {
      parts.push(`${movie.runtime} min`);
    }
    return parts.join(' · ');
  }

  protected heroTag(): string {
    return 'OpenAI pick';
  }

  protected ratingBadge(): string | null {
    return null;
  }
}
