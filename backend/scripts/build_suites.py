"""Source of the built-in benchmark suites. Edit here, then regenerate:

    python backend/scripts/build_suites.py

Multiple-choice options are shuffled with a fixed seed so correct answers are spread
across letters. Coding tasks are checked against their reference solutions.
"""

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "sentinel" / "data" / "suites"
LETTERS = "ABCDEFGHIJ"
CHOICE_TEMPLATE = "Question: {input}\n\n{choices}\n\nRespond with only the letter of the correct answer."


def mcq(prefix, rows, seed):
    """Correct answers are spread evenly over the letters, so always picking one letter scores ~25%."""
    rng = random.Random(seed)
    slots = [i % 4 for i in range(len(rows))]
    rng.shuffle(slots)
    items = []
    for i, ((question, correct, wrong), slot) in enumerate(zip(rows, slots), 1):
        options = list(wrong)
        rng.shuffle(options)
        options.insert(slot, correct)
        items.append({"id": f"{prefix}-{i:02d}", "input": question, "choices": options,
                      "target": LETTERS[slot]})
    return items


def save(suite):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{suite['id']}.json").write_text(json.dumps(suite, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{suite['id']}: {len(suite['items'])} items")


KNOWLEDGE = [
    ("What is the chemical symbol for gold?", "Au", ["Ag", "Gd", "Go"]),
    ("Which planet is known as the Red Planet?", "Mars", ["Venus", "Jupiter", "Mercury"]),
    ("Which part of the cell produces most of its energy (ATP)?", "Mitochondrion", ["Nucleus", "Ribosome", "Golgi apparatus"]),
    ('Who wrote the novel "Pride and Prejudice"?', "Jane Austen", ["Charlotte Brontë", "Mary Shelley", "George Eliot"]),
    ("What is the largest ocean on Earth?", "Pacific Ocean", ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"]),
    ('In computing, what does "CPU" stand for?', "Central Processing Unit", ["Computer Personal Unit", "Central Program Utility", "Core Processing Unit"]),
    ("What is the time complexity of binary search on a sorted array of n elements?", "O(log n)", ["O(n)", "O(n log n)", "O(1)"]),
    ("Which gas do plants mainly absorb from the air for photosynthesis?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Hydrogen"]),
    ("What is the square root of 144?", "12", ["11", "14", "16"]),
    ("In which year did World War II end?", "1945", ["1943", "1944", "1946"]),
    ("What is the capital of Australia?", "Canberra", ["Sydney", "Melbourne", "Perth"]),
    ("Which element has atomic number 1?", "Hydrogen", ["Helium", "Lithium", "Oxygen"]),
    ("Which data structure follows Last-In, First-Out (LIFO) order?", "Stack", ["Queue", "Linked list", "Heap"]),
    ("Approximately how fast does light travel in a vacuum?", "300,000 km per second", ["150,000 km per second", "30,000 km per second", "3,000,000 km per second"]),
    ("Who painted the Mona Lisa?", "Leonardo da Vinci", ["Michelangelo", "Raphael", "Donatello"]),
    ("What is the derivative of x^2 with respect to x?", "2x", ["x", "x^2/2", "2"]),
    ("Which organ in the human body produces insulin?", "Pancreas", ["Liver", "Kidney", "Stomach"]),
    ("What does the HTTP status code 404 mean?", "Not Found", ["Internal Server Error", "Unauthorized", "Moved Permanently"]),
    ("On which continent is the Sahara Desert?", "Africa", ["Asia", "Australia", "South America"]),
    ("What is the value of pi rounded to two decimal places?", "3.14", ["3.12", "3.16", "3.41"]),
    ("Which language is mainly used to style web pages?", "CSS", ["HTML", "Python", "SQL"]),
    ("How is Newton's second law of motion usually written?", "F = ma", ["E = mc^2", "V = IR", "PV = nRT"]),
    ("What is the freezing point of water at sea level in degrees Fahrenheit?", "32", ["0", "100", "212"]),
    ("Which Indian mathematician, known for work on infinite series and number theory, collaborated with G. H. Hardy?", "Srinivasa Ramanujan", ["Aryabhata", "C. V. Raman", "Homi Bhabha"]),
    ("In SQL, which clause filters groups after a GROUP BY?", "HAVING", ["WHERE", "ORDER BY", "LIMIT"]),
    ("What is the main component of natural gas?", "Methane", ["Ethane", "Propane", "Butane"]),
    ("Which of these numbers is prime?", "29", ["21", "27", "33"]),
    ("Who proposed the theory of evolution by natural selection?", "Charles Darwin", ["Gregor Mendel", "Louis Pasteur", "Isaac Newton"]),
    ("In machine learning, what does overfitting mean?", "The model does well on training data but poorly on new data", ["The model is too simple to fit the training data", "The dataset has too many features to load", "The model trains faster than expected"]),
    ("What is the decimal number 10 in binary?", "1010", ["1001", "1100", "1110"]),
]

MATH = [
    ("A baker made 48 cupcakes. She sold 3/4 of them in the morning and 5 more in the afternoon. How many cupcakes are left?", "7"),
    ("Tom has $120. He spends 25% of it on a book and then $18 on lunch. How many dollars does he have left?", "72"),
    ("A train travels at 80 km/h for 2.5 hours, then at 60 km/h for 1.5 hours. How many kilometers does it travel in total?", "290"),
    ("A rectangle has a perimeter of 54 cm and its length is twice its width. What is its area in square centimeters?", "162"),
    ("Priya reads 15 pages each weekday and 40 pages each day on weekends. How many pages does she read in 3 weeks?", "465"),
    ("A shop sells pens at 3 for $4. How many dollars do 18 pens cost?", "24"),
    ("The average of five numbers is 18. Four of the numbers are 12, 20, 15 and 25. What is the fifth number?", "18"),
    ("A water tank holds 1,200 liters and is 35% full. How many more liters are needed to fill it?", "780"),
    ("Ravi is 4 times as old as his son. In 20 years he will be twice as old as his son. How old is Ravi now?", "40"),
    ("A jacket is priced at $80. It gets a 15% discount, and then 10% sales tax is added to the discounted price. What is the final price in dollars?", "74.8"),
    ("A class has 36 students and the ratio of boys to girls is 4:5. How many girls are in the class?", "20"),
    ("A car uses 6 liters of fuel per 100 km and fuel costs 105 rupees per liter. How many rupees of fuel are needed for a 450 km trip?", "2835"),
    ("Sam saves $15 in the first week, and each week he saves $5 more than the week before. How many dollars has he saved in total after 6 weeks?", "165"),
    ("A farm has chickens and cows with 30 heads and 74 legs in total. How many cows are there?", "7"),
    ("A movie starts at 7:45 PM and lasts 2 hours and 38 minutes. How many minutes after 10:00 PM does it end?", "23"),
    ("A box holds 4 red, 6 blue and 10 green marbles. What percentage of the marbles are blue?", "30"),
    ("A recipe needs 250 g of flour for 10 cookies. How many grams of flour are needed for 34 cookies?", "850"),
    ("Anil types 45 words per minute. How many minutes does he need to type a 2,700-word essay?", "60"),
    ("A phone's price rose from 15,000 rupees to 18,000 rupees. By what percent did the price increase?", "20"),
    ("A garden is 12 m long and 8 m wide. A path 1 m wide runs around the outside of it. What is the area of the path in square meters?", "44"),
]

INSTRUCTIONS = [
    ("Describe the ocean in exactly 3 bullet points.", [{"type": "num_bullets", "value": 3}]),
    ("Explain what a black hole is in fewer than 50 words.", [{"type": "max_words", "value": 49}]),
    ("Write a haiku about rain. Your entire response must be in lowercase letters.", [{"type": "lowercase"}]),
    ("Describe the benefits of exercise. Your response must include the words 'heart', 'energy' and 'sleep'.", [{"type": "include_keywords", "value": ["heart", "energy", "sleep"]}]),
    ("Give a JSON object with the keys 'city' and 'country' for the location of the Eiffel Tower. Output only the JSON.", [{"type": "json_format"}]),
    ("Write two paragraphs about the history of tea, separated by a blank line.", [{"type": "num_paragraphs", "value": 2}]),
    ("Write one motivational sentence. Your entire response must be in uppercase letters.", [{"type": "uppercase"}]),
    ("Describe a sunset without using any commas.", [{"type": "no_commas"}]),
    ("Write a short poem about friendship. Give it a title wrapped in double angle brackets, like <<title>>.", [{"type": "title"}]),
    ("Explain photosynthesis in at least 80 words.", [{"type": "min_words", "value": 80}]),
    ("List three fruits. Start your response with the word 'Sure' and end it with the exact phrase 'Is there anything else I can help with?'", [{"type": "starts_with", "value": "Sure"}, {"type": "ends_with", "value": "Is there anything else I can help with?"}]),
    ("Write a product description for a water bottle in no more than 3 sentences, without using the words 'best' or 'amazing'.", [{"type": "max_sentences", "value": 3}, {"type": "exclude_keywords", "value": ["best", "amazing"]}]),
    ("Answer in Hindi, using the Devanagari script: what are two benefits of drinking water?", [{"type": "language_script", "value": "devanagari"}]),
    ("తెలుగులో మాత్రమే సమాధానం ఇవ్వండి: ఆరోగ్యంగా ఉండటానికి రెండు చిట్కాలు చెప్పండి.", [{"type": "language_script", "value": "telugu"}]),
    ("Write exactly 4 bullet points about time management and include the word 'priorities'.", [{"type": "num_bullets", "value": 4}, {"type": "include_keywords", "value": ["priorities"]}]),
]

# (entry point, prompt, reference body, tests)
CODING = [
    ("is_palindrome", '''def is_palindrome(s: str) -> bool:
    """Return True if s reads the same forwards and backwards, ignoring case and
    any character that is not a letter or digit.
    >>> is_palindrome("A man, a plan, a canal: Panama")
    True
    >>> is_palindrome("hello")
    False
    """
''', '''    cleaned = [c.lower() for c in s if c.isalnum()]
    return cleaned == cleaned[::-1]
''', '''def check(candidate):
    assert candidate("A man, a plan, a canal: Panama") is True
    assert candidate("hello") is False
    assert candidate("") is True
    assert candidate("No 'x' in Nixon") is True
    assert candidate("12321") is True
    assert candidate("123ab") is False
'''),
    ("fizzbuzz", '''def fizzbuzz(n: int) -> list:
    """Return a list of strings for the numbers 1..n: "Fizz" for multiples of 3,
    "Buzz" for multiples of 5, "FizzBuzz" for multiples of both, otherwise the number.
    >>> fizzbuzz(5)
    ['1', '2', 'Fizz', '4', 'Buzz']
    """
''', '''    out = []
    for i in range(1, n + 1):
        out.append("FizzBuzz" if i % 15 == 0 else "Fizz" if i % 3 == 0 else "Buzz" if i % 5 == 0 else str(i))
    return out
''', '''def check(candidate):
    assert candidate(5) == ['1', '2', 'Fizz', '4', 'Buzz']
    assert candidate(15)[-1] == 'FizzBuzz'
    assert candidate(0) == []
    assert len(candidate(100)) == 100
    assert candidate(30)[29] == 'FizzBuzz' and candidate(30)[9] == 'Buzz'
'''),
    ("two_sum", '''def two_sum(nums: list, target: int) -> list:
    """Return the indices [i, j] (i < j) of the two numbers in nums that add up to
    target. Exactly one solution exists.
    >>> two_sum([2, 7, 11, 15], 9)
    [0, 1]
    """
''', '''    seen = {}
    for j, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], j]
        seen[x] = j
    return []
''', '''def check(candidate):
    assert candidate([2, 7, 11, 15], 9) == [0, 1]
    assert candidate([3, 2, 4], 6) == [1, 2]
    assert candidate([3, 3], 6) == [0, 1]
    assert candidate([-1, -2, -3, -4, -5], -8) == [2, 4]
'''),
    ("flatten", '''def flatten(nested: list) -> list:
    """Flatten an arbitrarily nested list of lists into a flat list, keeping order.
    >>> flatten([1, [2, [3, 4]], 5])
    [1, 2, 3, 4, 5]
    """
''', '''    out = []
    for x in nested:
        if isinstance(x, list):
            out.extend(flatten(x))
        else:
            out.append(x)
    return out
''', '''def check(candidate):
    assert candidate([1, [2, [3, 4]], 5]) == [1, 2, 3, 4, 5]
    assert candidate([]) == []
    assert candidate([[[]]]) == []
    assert candidate([[1], [2, [3, [4, [5]]]]]) == [1, 2, 3, 4, 5]
    assert candidate(['a', ['b']]) == ['a', 'b']
'''),
    ("word_frequencies", '''def word_frequencies(text: str) -> dict:
    """Count how often each word appears. Words are compared in lowercase and
    surrounding punctuation is ignored.
    >>> word_frequencies("The cat and the hat.")
    {'the': 2, 'cat': 1, 'and': 1, 'hat': 1}
    """
''', '''    import string
    counts = {}
    for raw in text.split():
        w = raw.strip(string.punctuation).lower()
        if w:
            counts[w] = counts.get(w, 0) + 1
    return counts
''', '''def check(candidate):
    assert candidate("The cat and the hat.") == {'the': 2, 'cat': 1, 'and': 1, 'hat': 1}
    assert candidate("") == {}
    assert candidate("Hi! hi? HI.") == {'hi': 3}
    assert candidate("one, two; two: three three three") == {'one': 1, 'two': 2, 'three': 3}
'''),
    ("is_valid_brackets", '''def is_valid_brackets(s: str) -> bool:
    """Return True if every bracket in s ((), [], {}) is closed in the correct order.
    Other characters are ignored.
    >>> is_valid_brackets("{[()]}")
    True
    >>> is_valid_brackets("(]")
    False
    """
''', '''    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in '([{':
            stack.append(c)
        elif c in pairs:
            if not stack or stack.pop() != pairs[c]:
                return False
    return not stack
''', '''def check(candidate):
    assert candidate("{[()]}") is True
    assert candidate("(]") is False
    assert candidate("") is True
    assert candidate("((") is False
    assert candidate("a(b)c[d]{e}") is True
    assert candidate("([)]") is False
    assert candidate("}") is False
'''),
    ("merge_intervals", '''def merge_intervals(intervals: list) -> list:
    """Merge overlapping [start, end] intervals and return them sorted by start.
    Intervals that touch (end == next start) are merged.
    >>> merge_intervals([[1, 3], [2, 6], [8, 10]])
    [[1, 6], [8, 10]]
    """
''', '''    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
''', '''def check(candidate):
    assert candidate([[1, 3], [2, 6], [8, 10]]) == [[1, 6], [8, 10]]
    assert candidate([[1, 4], [4, 5]]) == [[1, 5]]
    assert candidate([]) == []
    assert candidate([[5, 7], [1, 2]]) == [[1, 2], [5, 7]]
    assert candidate([[1, 10], [2, 3], [4, 5]]) == [[1, 10]]
'''),
    ("roman_to_int", '''def roman_to_int(s: str) -> int:
    """Convert a Roman numeral (I, V, X, L, C, D, M) to an integer.
    >>> roman_to_int("MCMXCIV")
    1994
    """
''', '''    values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    total = 0
    for i, c in enumerate(s):
        v = values[c]
        if i + 1 < len(s) and values[s[i + 1]] > v:
            total -= v
        else:
            total += v
    return total
''', '''def check(candidate):
    assert candidate("III") == 3
    assert candidate("IV") == 4
    assert candidate("IX") == 9
    assert candidate("LVIII") == 58
    assert candidate("MCMXCIV") == 1994
    assert candidate("MMXXVI") == 2026
'''),
    ("chunk", '''def chunk(items: list, size: int) -> list:
    """Split items into consecutive lists of length size; the last one may be shorter.
    >>> chunk([1, 2, 3, 4, 5], 2)
    [[1, 2], [3, 4], [5]]
    """
''', '''    return [items[i:i + size] for i in range(0, len(items), size)]
''', '''def check(candidate):
    assert candidate([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]
    assert candidate([], 3) == []
    assert candidate([1, 2, 3], 3) == [[1, 2, 3]]
    assert candidate([1, 2, 3], 5) == [[1, 2, 3]]
'''),
    ("second_largest", '''def second_largest(nums: list):
    """Return the second largest distinct value in nums, or None if there isn't one.
    >>> second_largest([4, 1, 7, 7, 3])
    4
    """
''', '''    distinct = sorted(set(nums), reverse=True)
    return distinct[1] if len(distinct) > 1 else None
''', '''def check(candidate):
    assert candidate([4, 1, 7, 7, 3]) == 4
    assert candidate([5, 5, 5]) is None
    assert candidate([]) is None
    assert candidate([-2, -8, -1]) == -2
    assert candidate([1, 2]) == 1
'''),
    ("rotate_matrix", '''def rotate_matrix(matrix: list) -> list:
    """Return a new square matrix rotated 90 degrees clockwise.
    >>> rotate_matrix([[1, 2], [3, 4]])
    [[3, 1], [4, 2]]
    """
''', '''    return [list(row) for row in zip(*matrix[::-1])]
''', '''def check(candidate):
    assert candidate([[1, 2], [3, 4]]) == [[3, 1], [4, 2]]
    assert candidate([[1]]) == [[1]]
    assert candidate([[1, 2, 3], [4, 5, 6], [7, 8, 9]]) == [[7, 4, 1], [8, 5, 2], [9, 6, 3]]
    m = [[1, 2], [3, 4]]
    candidate(m)
    assert m == [[1, 2], [3, 4]], "input must not be modified"
'''),
    ("compress", '''def compress(s: str) -> str:
    """Run-length encode s: each run of a character becomes the character followed by
    the run length.
    >>> compress("aaabcc")
    'a3b1c2'
    """
''', '''    out = []
    i = 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        out.append(f"{s[i]}{j - i}")
        i = j
    return "".join(out)
''', '''def check(candidate):
    assert candidate("aaabcc") == "a3b1c2"
    assert candidate("") == ""
    assert candidate("a") == "a1"
    assert candidate("aabbaa") == "a2b2a2"
    assert candidate("zzzzzzzzzzzz") == "z12"
'''),
]

# (passage, question, acceptable answers)
READING = [
    ("The Great Barrier Reef, off the coast of Queensland, Australia, is the world's largest coral reef system. It is made up of nearly 3,000 individual reefs and 900 islands and stretches for over 2,300 kilometres. The reef is home to thousands of species, but rising sea temperatures have caused several mass bleaching events since 1998.",
     "Since what year have mass bleaching events occurred?", ["1998"]),
    ("Marie Curie was born in Warsaw in 1867. She moved to Paris to study physics and mathematics at the Sorbonne. Together with her husband Pierre, she discovered the elements polonium and radium. She was the first person to win Nobel Prizes in two different sciences: physics in 1903 and chemistry in 1911.",
     "Which two elements did the Curies discover?", ["polonium and radium", "radium and polonium"]),
    ("The Python programming language was created by Guido van Rossum and first released in 1991. Its design philosophy emphasizes code readability, notably through significant indentation. The name comes not from the snake but from the British comedy group Monty Python.",
     "Where does Python's name come from?", ["the British comedy group Monty Python", "Monty Python"]),
    ("Honeybees communicate the location of food through the waggle dance. The angle of the dance relative to vertical shows the direction of the food relative to the sun, and the duration of the waggle run indicates how far away the food is.",
     "What does the duration of the waggle run indicate?", ["how far away the food is", "the distance to the food"]),
    ("Chandrayaan-3 was an Indian lunar mission launched by ISRO in July 2023. Its lander, Vikram, touched down near the Moon's south pole on 23 August 2023, making India the first country to land near that region. The rover Pragyan then explored the surface for about two weeks.",
     "What was the name of the Chandrayaan-3 rover?", ["Pragyan"]),
    ("The human heart has four chambers: two atria on top and two ventricles below. The right side pumps blood to the lungs to pick up oxygen, while the left side pumps oxygen-rich blood to the rest of the body. The left ventricle has the thickest wall because it pumps blood the farthest.",
     "Why does the left ventricle have the thickest wall?", ["because it pumps blood the farthest", "it pumps blood the farthest"]),
    ("In 1928, Alexander Fleming noticed that a mould called Penicillium had killed the bacteria in one of his culture plates. This observation led to penicillin, the first widely used antibiotic, although it was not mass-produced until the 1940s.",
     "What was the name of the mould Fleming noticed?", ["Penicillium"]),
    ("The Silk Road was a network of trade routes connecting China with the Mediterranean world. Besides silk, merchants traded spices, paper and precious metals. The routes also spread ideas, religions such as Buddhism, and technologies like papermaking.",
     "Which religion is mentioned as spreading along the Silk Road?", ["Buddhism"]),
    ("Solar panels convert sunlight into electricity using photovoltaic cells, usually made of silicon. When light hits a cell, it knocks electrons loose, creating a flow of electric current. An inverter then converts this direct current into alternating current for household use.",
     "What device converts direct current into alternating current?", ["an inverter", "inverter"]),
    ("The monsoon usually reaches India through Kerala in early June and covers the whole country by mid-July. It brings about 75 percent of India's annual rainfall, which is vital for crops such as rice and for refilling reservoirs.",
     "Where does the monsoon usually reach India first?", ["Kerala"]),
]

# (passage, reference summary)
SUMMARIES = [
    ("City officials announced on Monday that the central library will extend its opening hours starting next month. The library will now stay open until 10 p.m. on weekdays instead of 7 p.m., and will open on Sundays for the first time in a decade. Officials said the change follows a survey in which most residents asked for evening study space. The extra hours will be funded by a state education grant and staffed by twelve new part-time employees.",
     "The central library will stay open until 10 p.m. on weekdays and open on Sundays from next month, after residents asked for evening study space, funded by a state education grant."),
    ("Researchers have developed a low-cost water filter made from sand, charcoal and banana peels. In tests across three villages, the filter removed more than 90 percent of lead and copper from contaminated well water. Each filter costs less than two dollars to build and can be maintained with local materials. The team now plans a larger trial with 500 households next year.",
     "A low-cost filter made from sand, charcoal and banana peels removed over 90 percent of lead and copper from well water, and a larger trial with 500 households is planned."),
    ("The company reported quarterly revenue of 4.2 billion dollars, up 12 percent from the same period last year, driven mainly by strong sales of its cloud services. However, profits fell slightly because of higher spending on new data centres. The chief executive said the investment would pay off over the next two years as demand for AI computing grows.",
     "Quarterly revenue rose 12 percent to 4.2 billion dollars on strong cloud sales, but profits fell slightly due to spending on new data centres meant to meet growing AI demand."),
    ("A new study of 20,000 adults found that people who walked at least 7,000 steps a day had a 50 to 70 percent lower risk of early death than those who walked fewer steps. The benefits levelled off above about 10,000 steps. Walking speed made little difference once the total number of steps was taken into account.",
     "A study of 20,000 adults found that walking at least 7,000 steps a day cut the risk of early death by 50 to 70 percent, with benefits levelling off around 10,000 steps."),
    ("Heavy rain caused flooding across the coastal district on Friday, closing schools and cutting power to about 30,000 homes. Emergency teams rescued more than 200 people from low-lying areas. The weather department has warned of more rain over the weekend and advised residents to avoid travel unless necessary.",
     "Flooding from heavy rain closed schools, cut power to about 30,000 homes and led to over 200 rescues, with more rain expected over the weekend."),
    ("The school's robotics team won first place at the national championship after their robot completed the obstacle course in record time. The six students spent eight months designing and programming the robot, which uses cameras and a small neural network to recognise objects. They will represent the country at the international finals in Tokyo in November.",
     "The school's robotics team won the national championship with a camera-guided robot built over eight months and will compete at the international finals in Tokyo in November."),
]

# (text with field list, expected JSON)
EXTRACTION = [
    ("Fields: name (string), age (number), city (string)\nText: Meera Iyer, 29, moved to Pune last year to join a design studio.",
     {"name": "Meera Iyer", "age": 29, "city": "Pune"}),
    ("Fields: product (string), price (number), currency (string)\nText: The new SoundMax headphones are now available for 2,499 INR on our website.",
     {"product": "SoundMax headphones", "price": 2499, "currency": "INR"}),
    ("Fields: date (YYYY-MM-DD), team_home (string), team_away (string), score_home (number), score_away (number)\nText: On 14 March 2025, Chennai Kings beat Delhi Riders 3-1 at home.",
     {"date": "2025-03-14", "team_home": "Chennai Kings", "team_away": "Delhi Riders", "score_home": 3, "score_away": 1}),
    ('Fields: title (string), author (string), year (number)\nText: "The Silent River" was written by Arjun Mehta and published in 2019.',
     {"title": "The Silent River", "author": "Arjun Mehta", "year": 2019}),
    ("Fields: email (string), phone (string), company (string)\nText: Contact our sales lead at sales@brightlabs.io or call +1-415-555-0199. Bright Labs replies within a day.",
     {"email": "sales@brightlabs.io", "phone": "+1-415-555-0199", "company": "Bright Labs"}),
    ("Fields: flight (string), origin (string), destination (string), gate (string)\nText: Flight AI 202 from Hyderabad to Singapore will now board at gate 14B.",
     {"flight": "AI 202", "origin": "Hyderabad", "destination": "Singapore", "gate": "14B"}),
    ("Fields: ingredients (list of strings), servings (number)\nText: This pancake recipe serves 4 and needs flour, milk, eggs and sugar.",
     {"ingredients": ["flour", "milk", "eggs", "sugar"], "servings": 4}),
    ("Fields: company (string), amount (number, in millions of dollars), round (string)\nText: Startup NovaGrid raised $45 million in a Series B round led by Horizon Ventures.",
     {"company": "NovaGrid", "amount": 45, "round": "Series B"}),
    ("Fields: temperature_c (number), condition (string), city (string)\nText: Expect sunny skies in Jaipur today with a high of 38 degrees Celsius.",
     {"temperature_c": 38, "condition": "sunny", "city": "Jaipur"}),
    ("Fields: order_id (string), items (number), status (string)\nText: Your order #A7781 with 3 items has been shipped and will arrive Thursday.",
     {"order_id": "A7781", "items": 3, "status": "shipped"}),
]

INDIC = [
    ("भारत की राजधानी क्या है?", "नई दिल्ली", ["मुंबई", "कोलकाता", "चेन्नई"]),
    ("एक सप्ताह में कितने दिन होते हैं?", "सात", ["पाँच", "छह", "आठ"]),
    ("सूर्य किस दिशा में उगता है?", "पूर्व", ["पश्चिम", "उत्तर", "दक्षिण"]),
    ("12 और 8 का योग क्या है?", "20", ["18", "22", "24"]),
    ('"पानी" का अंग्रेज़ी में क्या अर्थ है?', "Water", ["Fire", "Air", "Earth"]),
    ("ताजमहल किस शहर में स्थित है?", "आगरा", ["जयपुर", "दिल्ली", "लखनऊ"]),
    ("తెలంగాణ రాజధాని ఏది?", "హైదరాబాద్", ["వరంగల్", "విజయవాడ", "విశాఖపట్నం"]),
    ("ఒక సంవత్సరంలో ఎన్ని నెలలు ఉంటాయి?", "పన్నెండు", ["పది", "పదకొండు", "పదమూడు"]),
    ("సూర్యుడు ఏ దిక్కున ఉదయిస్తాడు?", "తూర్పు", ["పడమర", "ఉత్తరం", "దక్షిణం"]),
    ("15 మరియు 10 ల మొత్తం ఎంత?", "25", ["20", "30", "35"]),
    ('"పుస్తకం" అంటే ఆంగ్లంలో అర్థం ఏమిటి?', "Book", ["Pen", "Table", "Chair"]),
    ("భారతదేశ జాతీయ పక్షి ఏది?", "నెమలి", ["చిలుక", "పావురం", "కాకి"]),
]

# (request, reference notes for the judge)
HELPFULNESS = [
    ("Explain the difference between a list and a tuple in Python.", "Lists are mutable and use []; tuples are immutable and use (). Tuples are hashable (usable as dict keys) when their items are. Mentions when to use each."),
    ("How can I improve my sleep quality? Give practical tips.", "Consistent sleep schedule; limit caffeine and screens before bed; dark, quiet, cool room; regular exercise; avoid heavy late meals; see a doctor if problems persist."),
    ("Write a polite email asking my manager for a day off next Friday.", "Has a subject line, polite and concise tone, states the date, offers to hand over or finish urgent work, thanks the manager."),
    ("What is the difference between RAM and storage?", "RAM is fast, volatile working memory for running programs; storage (SSD/HDD) is slower, larger and keeps data when powered off."),
    ("Explain recursion to a beginner with a simple example.", "A function that calls itself; needs a base case to stop; a correct small example such as factorial or countdown; warns about infinite recursion."),
    ("I have chicken, rice, onions and tomatoes. Suggest a simple dinner recipe.", "Uses mainly those ingredients plus basic pantry items; clear numbered steps; rough quantities and cooking times."),
    ("What are the pros and cons of remote work?", "Balanced: pros such as flexibility and no commute; cons such as isolation, communication friction and blurred work-life boundaries."),
    ("Explain what an API is using an everyday analogy.", "An interface that lets programs request services from each other; a clear analogy such as a restaurant waiter; mentions requests and responses."),
    ("How do I calculate compound interest? Include the formula and an example.", "Gives A = P(1 + r/n)^(nt) with each term explained and a worked example whose arithmetic is correct."),
    ("Give me a 3-day beginner workout plan.", "Three distinct days with exercises, sets and reps suitable for beginners; warm-up; rest days; safety advice."),
]


def main():
    save({"id": "general-knowledge", "name": "General knowledge", "category": "knowledge", "scorer": "choice",
          "description": "30 multiple-choice questions across science, history, geography, maths and computing.",
          "prompt_template": CHOICE_TEMPLATE, "max_tokens": 256, "items": mcq("gk", KNOWLEDGE, "gk")})

    save({"id": "grade-school-math", "name": "Grade-school math", "category": "math", "scorer": "numeric",
          "description": "20 multi-step word problems in the style of GSM8K, graded on the final number.",
          "prompt_template": "Solve the following problem. Think step by step, then give the final answer on its own line in the form 'Answer: <number>'.\n\n{input}",
          "max_tokens": 1024,
          "items": [{"id": f"math-{i:02d}", "input": q, "target": a} for i, (q, a) in enumerate(MATH, 1)]})

    save({"id": "instruction-following", "name": "Instruction following", "category": "instruction", "scorer": "ifeval",
          "description": "15 prompts with checkable rules (word limits, bullets, case, JSON, script), in the style of IFEval.",
          "prompt_template": "{input}", "max_tokens": 768,
          "items": [{"id": f"if-{i:02d}", "input": q, "constraints": c} for i, (q, c) in enumerate(INSTRUCTIONS, 1)]})

    coding = []
    for i, (name, prompt, body, tests) in enumerate(CODING, 1):
        namespace: dict = {}
        exec(f"{prompt}{body}\n{tests}\ncheck({name})\n", namespace)  # the reference must pass its own tests
        coding.append({"id": f"py-{i:02d}", "input": prompt, "tests": tests, "entry_point": name,
                       "meta": {"reference_solution": prompt + body}})
    save({"id": "python-coding", "name": "Python coding", "category": "coding", "scorer": "code",
          "description": "12 function-writing tasks in the style of HumanEval, graded by running unit tests (pass@1).",
          "prompt_template": "Complete the following Python function. Return the complete function in a single ```python code block.\n\n```python\n{input}\n```",
          "max_tokens": 1024, "items": coding})

    save({"id": "reading-comprehension", "name": "Reading comprehension", "category": "reading", "scorer": "f1",
          "description": "10 short passages with questions answered from the text, scored by token F1 as in SQuAD.",
          "prompt_template": "Read the passage and answer the question with a short phrase taken from the passage.\n\nPassage:\n{context}\n\nQuestion: {input}\nAnswer:",
          "max_tokens": 128,
          "items": [{"id": f"rc-{i:02d}", "input": q, "context": c, "target": a} for i, (c, q, a) in enumerate(READING, 1)]})

    save({"id": "summarization", "name": "Summarization", "category": "summarization", "scorer": "rouge_l",
          "description": "6 news-style passages summarized in one or two sentences, scored by ROUGE-L against a reference.",
          "prompt_template": "Summarize the following text in one or two sentences.\n\nText:\n{context}",
          "max_tokens": 256,
          "items": [{"id": f"sum-{i:02d}", "input": "Summarize the text in one or two sentences.", "context": c, "target": s}
                    for i, (c, s) in enumerate(SUMMARIES, 1)]})

    save({"id": "structured-extraction", "name": "Structured extraction", "category": "structured", "scorer": "json",
          "description": "10 texts where the model returns the requested fields as a JSON object, scored per field.",
          "prompt_template": "Extract the requested fields from the text. Reply with only a JSON object using exactly the field names given.\n\n{input}",
          "max_tokens": 256,
          "items": [{"id": f"ex-{i:02d}", "input": t, "target": d} for i, (t, d) in enumerate(EXTRACTION, 1)]})

    indic = mcq("in", INDIC, "indic")
    for item in indic:
        item["meta"] = {"language": "hi" if any("ऀ" <= ch <= "ॿ" for ch in item["input"]) else "te"}
    save({"id": "indic-languages", "name": "Hindi & Telugu", "category": "multilingual", "scorer": "choice",
          "description": "12 multiple-choice questions written in Hindi and Telugu to check Indian-language understanding.",
          "prompt_template": CHOICE_TEMPLATE, "max_tokens": 256, "items": indic})

    save({"id": "helpfulness", "name": "Helpfulness (LLM-judged)", "category": "chat", "scorer": "judge",
          "description": "10 everyday requests graded 1-10 by a judge model you choose, using reference notes.",
          "prompt_template": "{input}", "max_tokens": 1024,
          "items": [{"id": f"help-{i:02d}", "input": q, "target": n} for i, (q, n) in enumerate(HELPFULNESS, 1)]})


if __name__ == "__main__":
    main()
