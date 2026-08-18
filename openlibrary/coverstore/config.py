image_engine = "pil"
image_sizes = {"S": (116, 58), "M": (180, 360), "L": (500, 500)}

default_image = None
data_root = None

# Optional upstream coverstore (e.g. https://covers.openlibrary.org). When set,
# requests for covers this store doesn't have redirect there instead of
# returning default_image. Meant for dev, where the local store is nearly empty.
fallback_url = None

ol_url = "http://openlibrary.org/"

# ids of the blocked covers
# this is used to block covers when someone requests
# an image to be blocked.
blocked_covers: list[str] = []


def get(name, default=None):
    return globals().get(name, default)
