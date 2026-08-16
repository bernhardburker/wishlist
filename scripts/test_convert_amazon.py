#!/usr/bin/env python3
import os
import sys
import tempfile
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.convert_amazon import parse_amazon_html, compare_and_match, map_category

sample_amazon_html = """
<html>
<body>
<div id="wishlist-page">
  <ul id="g-items">
    <li id="item_I12345" class="g-item-sortable" data-itemid="I12345" data-itemprimeinfo='{"ASIN":"B08XYZ1234"}'>
      <div id="itemImage_I12345">
        <img src="https://m.media-amazon.com/images/I/71xyz123._AC_SL1500_.jpg" />
      </div>
      <div class="g-item-details">
        <h2 class="a-size-base">
          <a id="itemName_I12345" href="/dp/B08XYZ1234/ref=wl_dp" title="PAW Patrol - Dino Rescue Rocky Rettungsfahrzeug">
            PAW Patrol - Dino Rescue Rocky Rettungsfahrzeug
          </a>
        </h2>
        <span class="a-price"><span class="a-offscreen">18,49 €</span></span>
        <span id="itemComment_I12345">Lieblingsfigur von Karin</span>
      </div>
    </li>
    <li id="item_I67890" class="g-item-sortable" data-itemid="I67890" data-itemprimeinfo='{"ASIN":"B09ABC5678"}'>
      <div id="itemImage_I67890">
        <img src="https://m.media-amazon.com/images/I/61abc456._AC_SL1200_.jpg" />
      </div>
      <div class="g-item-details">
        <h2 class="a-size-base">
          <a id="itemName_I67890" href="/dp/B09ABC5678" title="LEGO 76261 Marvel Spider-Man Finale">
            LEGO 76261 Marvel Spider-Man Finale
          </a>
        </h2>
        <span class="a-price"><span class="a-offscreen">84,99 €</span></span>
      </div>
    </li>
  </ul>
</div>
</body>
</html>
"""

def test_parsing():
    items = parse_amazon_html(sample_amazon_html)
    assert len(items) == 2, f"Expected 2 items, got {len(items)}"
    assert items[0]["asin"] == "B08XYZ1234"
    assert items[0]["title"] == "PAW Patrol - Dino Rescue Rocky Rettungsfahrzeug"
    assert items[0]["price"] == 18.49
    assert items[0]["image"] == "https://m.media-amazon.com/images/I/71xyz123.jpg"
    assert items[0]["note"] == "Lieblingsfigur von Karin"
    assert items[1]["asin"] == "B09ABC5678"
    assert items[1]["price"] == 84.99
    print("✅ Parsing-Test erfolgreich!")

def test_matching():
    smyths_wishes = [
        {
            "id": "smyths-258441",
            "title": "PAW Patrol: Der Dino-Film Set Rocky mit Dino-Rettungs-LKW",
            "price": 19.99,
            "url": "https://www.smythstoys.com/at/de-at/p/258441"
        }
    ]
    items = parse_amazon_html(sample_amazon_html)
    result = compare_and_match(items, smyths_wishes)
    assert len(result["matched"]) == 1, f"Expected 1 match, got {len(result['matched'])}"
    assert len(result["unmatched_amazon"]) == 1, f"Expected 1 unmatched Amazon, got {len(result['unmatched_amazon'])}"
    match = result["matched"][0]
    assert match["smyths"]["id"] == "smyths-258441"
    print(f"✅ Matching-Test erfolgreich! Match: '{match['amazon']['title']}' <-> '{match['smyths']['title']}' (Score: {match['score']})")

if __name__ == "__main__":
    test_parsing()
    test_matching()
