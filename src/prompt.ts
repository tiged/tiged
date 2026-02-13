import readline from 'node:readline';
import readlinePromises from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const defaultListLimit = 10;

export interface PromptChoice {
  name?: string;
  message: string;
  value: string;
}

export interface InputPromptConfig {
  message: string;
  initial?: string;
}

export interface TogglePromptConfig {
  message: string;
  initial?: boolean;
}

export interface AutocompletePromptConfig {
  message: string;
  choices: PromptChoice[];
  suggest: (input: string, choices: PromptChoice[]) => PromptChoice[];
  limit?: number;
}

/**
 * Creates a readline interface configured for prompting users.
 *
 * @returns A readline interface bound to the process stdio streams.
 */
const createPromptInterface = () => {
  const rl = readlinePromises.createInterface({ input, output });
  rl.on('SIGINT', () => {
    output.write('\n');
    process.exit(130);
  });
  return rl;
};

/**
 * Prompts the user for string input.
 *
 * @param config - Prompt configuration for the input.
 * @returns The user input string.
 */
export const promptInput = async (config: InputPromptConfig) => {
  const rl = createPromptInterface();
  const suffix = config.initial ? ` (${config.initial}) ` : ' ';
  const answer = await rl.question(`${config.message}${suffix}`);
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed && config.initial) {
    return config.initial;
  }

  return trimmed;
};

/**
 * Prompts the user for a yes/no toggle.
 *
 * @param config - Prompt configuration for the toggle.
 * @returns A boolean reflecting the user choice.
 */
export const promptToggle = async (config: TogglePromptConfig) => {
  const rl = createPromptInterface();
  const initial = config.initial ?? false;
  const suffix = initial ? ' (Y/n) ' : ' (y/N) ';
  const answer = await rl.question(`${config.message}${suffix}`);
  rl.close();

  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return initial;
  }

  return ['y', 'yes', 'true', '1'].includes(normalized);
};

/**
 * Prompts the user to select from a list using a search query.
 *
 * @param config - Prompt configuration for the autocomplete prompt.
 * @returns The selected choice value.
 */
export const promptAutocomplete = async (config: AutocompletePromptConfig) => {
  if (config.choices.length === 0) {
    return promptInput({ message: config.message });
  }

  const rl = createPromptInterface();
  const limit = config.limit ?? defaultListLimit;
  let currentChoices = config.suggest('', config.choices);
  let inputValue = '';
  let printedLines = 0;

  const renderChoices = (choices: PromptChoice[]) => {
    const limited = choices.slice(0, limit);
    const lines = limited.map(
      (choice, index) => `  ${index + 1}) ${choice.message}`,
    );
    return lines.join('\n');
  };

  /**
   * Renders the autocomplete screen with the current input and choices.
   */
  const renderScreen = () => {
    if (printedLines > 0) {
      readline.moveCursor(output, 0, -printedLines);
      readline.clearScreenDown(output);
    }

    const header = `${config.message}`;
    const inputLine = `Search or select number: ${inputValue}`;
    const body = currentChoices.length
      ? renderChoices(currentChoices)
      : '  (no matches)';

    const outputText = `\n${header}\n${body}\n${inputLine}`;
    output.write(outputText);
    printedLines = outputText.split('\n').length - 1;
  };

  const setChoices = (query: string) => {
    const filtered = config.suggest(query, config.choices);
    currentChoices = filtered.length ? filtered : [];
  };

  readline.emitKeypressEvents(input, rl);
  if (input.isTTY) {
    input.setRawMode(true);
  }

  let isClosed = false;
  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    if (input.isTTY) {
      input.setRawMode(false);
    }
    rl.close();
  };

  const resolveSelection = () => {
    if (!inputValue) {
      return currentChoices.length === 1
        ? (currentChoices[0]?.value ?? null)
        : null;
    }

    const selectedIndex = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(selectedIndex)) {
      const choice = currentChoices[selectedIndex - 1];
      return choice?.value ?? null;
    }

    const directMatch = config.choices.find(
      choice => choice.value.toLowerCase() === inputValue.toLowerCase(),
    );
    if (directMatch) {
      return directMatch.value;
    }

    if (currentChoices.length === 1) {
      return currentChoices[0]?.value ?? null;
    }

    return null;
  };

  setChoices(inputValue);
  renderScreen();

  try {
    while (true) {
      const selection = await new Promise<string | null>(resolve => {
        const onKeypress = (chunk: string, key: readline.Key) => {
          input.off('keypress', onKeypress);

          if (key.name === 'return') {
            resolve(resolveSelection());
            return;
          }

          if (key.name === 'backspace') {
            inputValue = inputValue.slice(0, -1);
            setChoices(inputValue);
            renderScreen();
            resolve(null);
            return;
          }

          if (key.ctrl && key.name === 'c') {
            resolve(null);
            process.emit('SIGINT');
            return;
          }

          if (
            key.sequence &&
            !key.ctrl &&
            !key.meta &&
            key.sequence.length === 1
          ) {
            inputValue += key.sequence;
            setChoices(inputValue);
            renderScreen();
            resolve(null);
          }
        };

        input.on('keypress', onKeypress);
      });

      if (selection) {
        cleanup();
        output.write('\n');
        return selection;
      }
    }
  } finally {
    cleanup();
  }
};
