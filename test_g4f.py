from g4f.client import Client
from g4f.Provider import Blackbox, DDG, ChatGptEs, FreeGpt, Liaobots

providers = [Blackbox, DDG, ChatGptEs, FreeGpt, Liaobots]

for P in providers:
    try:
        print(f"Testing {P.__name__}...")
        client = Client(provider=P)
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Write exactly one short example sentence for the word 'apple'. Do not write anything else."}],
            timeout=10
        )
        print(f"Success! Response: {response.choices[0].message.content}")
        break  # stop on first success
    except Exception as e:
        print(f"Failed: {e}")
