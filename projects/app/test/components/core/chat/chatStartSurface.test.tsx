import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatStartSurface } from '../../../../src/components/core/chat/ChatContainer/ChatBox/components/ChatStartSurface';

describe('ChatStartSurface', () => {
  it('renders required variables before welcome and conversation content', () => {
    // Given: an empty chat with a required variable form and supporting content.
    const variableMarker = 'data-section="variables"';
    const welcomeMarker = 'data-section="welcome"';
    const conversationMarker = 'data-section="conversation"';

    // When: the shared start surface renders every content slot.
    const markup = renderToStaticMarkup(
      <ChatStartSurface
        variableEntry={<section data-section="variables" />}
        welcome={<section data-section="welcome" />}
        conversation={<section data-section="conversation" />}
      />
    );

    // Then: variables are the first content prerequisite.
    expect(markup.indexOf(variableMarker)).toBeLessThan(markup.indexOf(welcomeMarker));
    expect(markup.indexOf(welcomeMarker)).toBeLessThan(markup.indexOf(conversationMarker));
  });
});
