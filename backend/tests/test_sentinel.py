import json
import time

import pytest
from fastapi.testclient import TestClient

from sentinel import db, scorers, suites
from sentinel.models import Item, SuiteInfo


@pytest.fixture(autouse=True)
def database(tmp_path):
    db.configure(str(tmp_path / "test.db"))


@pytest.fixture()
def client():
    from sentinel.api import app

    with TestClient(app) as c:
        yield c


def wait_for(client, run_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] not in ("queued", "running"):
            return run
        time.sleep(0.2)
    raise AssertionError("run did not finish")


# ---------------------------------------------------------------- scorers


def test_choice_extraction():
    choices = ["Paris", "Rome", "Berlin", "Madrid"]
    assert scorers.extract_choice("Answer: C", choices) == "C"
    assert scorers.extract_choice("The answer is (b).", choices) == "B"
    assert scorers.extract_choice("D", choices) == "D"
    assert scorers.extract_choice("**A**. Paris is correct", choices) == "A"
    assert scorers.extract_choice("It's Berlin.", choices) == "C"
    assert scorers.extract_choice("I am not sure.", choices) is None


def test_numeric_and_reasoning_models():
    item = Item(id="1", input="q", target="74.8")
    assert scorers.score_numeric(item, "15% off gives 68, plus tax...\nAnswer: 74.80").passed
    assert scorers.score_numeric(Item(id="2", input="q", target="2835"), "Total = 2,835 rupees").passed
    assert not scorers.score_numeric(item, "Answer: 75").passed
    assert scorers.strip_reasoning("<think>hmm 12</think>Answer: 7") == "Answer: 7"


def test_ifeval_json_and_text_scorers():
    item = Item(id="1", input="q", constraints=[{"type": "num_bullets", "value": 2}, {"type": "lowercase"}])
    assert scorers.score_ifeval(item, "- one\n- two").passed
    assert scorers.score_ifeval(item, "- One\n- two").value == 0.5
    telugu = Item(id="2", input="q", constraints=[{"type": "language_script", "value": "telugu"}])
    assert scorers.score_ifeval(telugu, "రోజూ నీళ్ళు తాగండి.").passed
    extract = Item(id="3", input="q", target={"name": "Meera Iyer", "age": 29})
    assert scorers.score_json(extract, 'Here you go:\n```json\n{"name": "meera iyer", "age": 29}\n```').passed
    assert scorers.score_json(extract, '{"name": "Meera"}').value == 0.0
    assert scorers.token_f1("Monty Python", "the British comedy group Monty Python") > 0.5
    assert scorers.rouge_l("the cat sat on the mat", "the cat sat on the mat") == 1.0


def test_builtin_coding_references_pass():
    suite = suites.get_suite("python-coding")
    for item in suite.items:
        response = f"```python\n{item.meta['reference_solution']}\n```"
        ok, detail = scorers.run_python(scorers.build_program(item, response))
        assert ok, f"{item.entry_point}: {detail}"
    bad = suite.items[0]
    assert not scorers.run_python(scorers.build_program(bad, "```python\ndef is_palindrome(s):\n    return False\n```"))[0]


def test_choice_answers_are_balanced():
    for suite_id in ("general-knowledge", "indic-languages"):
        targets = [i.target for i in suites.get_suite(suite_id).items]
        assert max(targets.count(letter) for letter in "ABCD") <= len(targets) / 4 + 1


def test_prompt_rendering():
    info = SuiteInfo(id="s", name="s", scorer="choice", prompt_template="{context}Q: {input}\n\n{choices}")
    messages = suites.render_messages(info, Item(id="1", input="Pick", choices=["x", "y"]))
    assert messages == [{"role": "user", "content": "Q: Pick\n\nA. x\nB. y"}]


# -------------------------------------------------------------------- api


def test_end_to_end_with_baseline(client):
    baseline = client.post("/api/models/baseline").json()
    assert client.post("/api/models/baseline").json()["id"] == baseline["id"]  # idempotent

    assert len(client.get("/api/suites").json()) >= 9
    res = client.post("/api/runs", json={"model_ids": [baseline["id"]], "config": {
        "suite_ids": ["general-knowledge", "grade-school-math", "instruction-following"], "limit": 6}})
    assert res.status_code == 201, res.text
    run = wait_for(client, res.json()[0]["id"])
    assert run["status"] == "completed"
    assert run["summary"]["total"] == 18 and run["summary"]["completed"] == 18
    assert run["summary"]["errors"] == 0
    assert run["summary"]["perf"]["tokens_per_sec"] > 0
    assert {s["suite_id"] for s in run["summary"]["by_suite"]} == {"general-knowledge", "grade-school-math", "instruction-following"}
    assert all(0 <= s["score"] <= 1 for s in run["samples"])

    overview = client.get("/api/overview").json()
    assert overview["runs"] == 1 and len(overview["matrix"]) == 3

    report = client.get(f"/api/runs/{run['id']}/report.md")
    assert report.status_code == 200 and "General knowledge" in report.text


def test_run_validation(client):
    baseline = client.post("/api/models/baseline").json()
    res = client.post("/api/runs", json={"model_ids": [baseline["id"]], "config": {"suite_ids": ["python-coding"]}})
    assert res.status_code == 400 and "code" in res.json()["detail"]
    res = client.post("/api/runs", json={"model_ids": [baseline["id"]], "config": {"suite_ids": ["helpfulness"]}})
    assert res.status_code == 400 and "judge" in res.json()["detail"]
    res = client.post("/api/runs", json={"model_ids": [baseline["id"]], "config": {"suite_ids": ["nope"]}})
    assert res.status_code == 400


def test_coding_run_with_judge_and_unreachable_model(client):
    baseline = client.post("/api/models/baseline").json()
    res = client.post("/api/runs", json={"model_ids": [baseline["id"]], "config": {
        "suite_ids": ["python-coding", "helpfulness"], "limit": 2, "allow_code_execution": True,
        "judge_model_id": baseline["id"]}})
    run = wait_for(client, res.json()[0]["id"])
    assert run["status"] == "completed"
    assert all(s["passed"] is False for s in run["samples"] if s["suite_id"] == "python-coding")

    offline = client.post("/api/models", json={"name": "offline", "base_url": "http://127.0.0.1:9/v1", "model": "x"}).json()
    res = client.post("/api/runs", json={"model_ids": [offline["id"]], "config": {"suite_ids": ["general-knowledge"], "limit": 2}})
    run = wait_for(client, res.json()[0]["id"])
    assert run["status"] == "failed" and "Cannot reach" in run["error"]
    assert client.post(f"/api/models/{offline['id']}/test").json()["ok"] is False


def test_custom_suite_upload(client):
    jsonl = "\n".join(json.dumps(r) for r in [{"input": "2+2?", "target": "4"}, {"input": "3+3?", "target": "6"}])
    res = client.post("/api/suites", json={"name": "Tiny math", "scorer": "numeric", "jsonl": jsonl})
    assert res.status_code == 201, res.text
    assert res.json()["item_count"] == 2 and res.json()["id"] == "custom-tiny-math"
    bad = client.post("/api/suites", json={"name": "Bad", "scorer": "exact", "jsonl": '{"target": 1}'})
    assert bad.status_code == 400
    assert client.delete("/api/suites/general-knowledge").status_code == 400
    assert client.delete("/api/suites/custom-tiny-math").status_code == 204


def test_arena_and_chat(client):
    a = client.post("/api/models/baseline").json()
    b = client.post("/api/models", json={"name": "Baseline B", "kind": "baseline", "base_url": None, "model": "b"}).json()
    battle = client.post("/api/arena/battles", json={"prompt": "Say hi"}).json()
    assert battle["a"]["model_name"] is None  # hidden before voting
    voted = client.post(f"/api/arena/battles/{battle['id']}/vote", json={"winner": "a"}).json()
    assert voted["a"]["model_name"] in ("Random baseline", "Baseline B")
    assert client.post(f"/api/arena/battles/{battle['id']}/vote", json={"winner": "b"}).status_code == 409
    board = client.get("/api/arena/leaderboard").json()
    assert board[0]["rating"] > 1000 > board[1]["rating"] and board[0]["wins"] == 1

    lines = client.post("/api/chat", json={"model_id": b["id"], "messages": [{"role": "user", "content": "hello"}]}).text
    events = [json.loads(line) for line in lines.splitlines()]
    assert any("delta" in e for e in events) and events[-1]["done"] is True
    assert events[-1]["metrics"]["output_tokens"] > 0
    assert a["id"] != b["id"]
