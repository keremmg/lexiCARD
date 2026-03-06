from duckduckgo_search import DDGS
import sys

print("Testing DuckDuckGo Search API")
try:
    results = DDGS().chat("Write a short example sentence for 'apple'")
    print(results)
except Exception as e:
    import traceback
    traceback.print_exc()
