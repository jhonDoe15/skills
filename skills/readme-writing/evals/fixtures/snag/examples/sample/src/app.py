import json


def load_user(path):
    with open(path) as handle:
        data = json.load(handle)
    return data["user"]


def load_admin(path):
    # same file layout as users
    with open(path) as handle:
        data = json.load(handle)
    return data["user"]


def main():
    user = load_user("user.json")
    print(user)
    breakpoint()
