/**
 * API client for the Press Council backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export const api = {
  // ==========================================================================
  // Configuration Endpoints
  // ==========================================================================

  /**
   * Get complete configuration for the frontend.
   */
  async getConfig() {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) {
      throw new Error('Failed to get config');
    }
    return response.json();
  },

  /**
   * Get available modes and their configurations.
   */
  async getModes() {
    const response = await fetch(`${API_BASE}/api/config/modes`);
    if (!response.ok) {
      throw new Error('Failed to get modes');
    }
    return response.json();
  },

  /**
   * Get available LLM blocks.
   */
  async getLLMBlocks() {
    const response = await fetch(`${API_BASE}/api/config/llm-blocks`);
    if (!response.ok) {
      throw new Error('Failed to get LLM blocks');
    }
    return response.json();
  },

  /**
   * Get available journalist personas.
   */
  async getPersonas() {
    const response = await fetch(`${API_BASE}/api/config/personas`);
    if (!response.ok) {
      throw new Error('Failed to get personas');
    }
    return response.json();
  },

  /**
   * Get criticism levels configuration.
   */
  async getCriticismLevels() {
    const response = await fetch(`${API_BASE}/api/config/criticism-levels`);
    if (!response.ok) {
      throw new Error('Failed to get criticism levels');
    }
    return response.json();
  },

  // ==========================================================================
  // Conversation Endpoints
  // ==========================================================================

  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`
    );
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  },

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }
    return response.json();
  },

  // ==========================================================================
  // Press Release Endpoints
  // ==========================================================================

  /**
   * Create a press release with custom configuration.
   * @param {string} conversationId - The conversation ID
   * @param {object} options - Configuration options
   * @param {string} options.content - The press release request content
   * @param {string} [options.mode] - The mode to use (simple, standard, full)
   * @param {string[]} [options.writers] - Custom writer LLM IDs
   * @param {string[][]} [options.matrix] - Custom evaluation matrix [[llm_id, persona_id], ...]
   * @param {string} [options.editor] - Custom editor LLM ID
   * @param {number} [options.criticismLevel] - Criticism level (1-5)
   */
  async createPressRelease(conversationId, options) {
    const { content, mode, writers, matrix, editor, criticismLevel } = options;

    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/press-release`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          mode,
          writers,
          matrix,
          editor,
          criticism_level: criticismLevel,
        }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to create press release');
    }
    return response.json();
  },

  /**
   * Create a press release with streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {object} options - Configuration options
   * @param {string} options.content - The press release request content
   * @param {string} [options.mode] - The mode to use (simple, standard, full)
   * @param {string[]} [options.writers] - Custom writer LLM IDs
   * @param {string[][]} [options.matrix] - Custom evaluation matrix [[llm_id, persona_id], ...]
   * @param {string} [options.editor] - Custom editor LLM ID
   * @param {number} [options.criticismLevel] - Criticism level (1-5)
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async createPressReleaseStream(conversationId, options, onEvent, abortSignal = null) {
    const { content, mode, writers, matrix, editor, criticismLevel } = options;

    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/press-release/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          mode,
          writers,
          matrix,
          editor,
          criticism_level: criticismLevel,
        }),
        signal: abortSignal,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create press release');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e, data.substring(0, 100));
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      try {
        const event = JSON.parse(data);
        onEvent(event.type, event);
      } catch (e) {
        // Ignore incomplete final chunk
      }
    }
  },

  // ==========================================================================
  // Legacy Endpoints (Backward Compatibility)
  // ==========================================================================

  /**
   * Send a message in a conversation (legacy).
   */
  async sendMessage(conversationId, content) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates (legacy).
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, onEvent) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
};
