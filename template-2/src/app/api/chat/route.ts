import { NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set in environment variables');
}

// Set response timeout to 30 seconds
export const maxDuration = 30;

// Configure the runtime to use edge for better streaming support
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'o3-mini',
        messages,
        stream: true,
        max_completion_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API Error:', response.status, error);
      throw new Error(error.message || 'Failed to get response from OpenAI');
    }

    if (!response.body) {
      throw new Error('No response body available');
    }

    const reader = response.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;
              if (line.trim() === 'data: [DONE]') continue;

              let data = line;
              if (line.startsWith('data: ')) {
                data = line.slice(6);
              }

              let buffer = '';
              try {
                buffer += data;
                const parsed = JSON.parse(buffer);
                controller.enqueue(encoder.encode(JSON.stringify(parsed) + '\n'));
                buffer = '';
              } catch (e) {
                if (e instanceof SyntaxError) {
                  // Wait for more data
                  continue;
                } else {
                  console.error('Error parsing JSON:', e);
                  buffer = '';
                }
              }
            }
          }
        } catch (e) {
          controller.error(e);
        }
      },

      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  }
} 