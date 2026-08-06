def solve(shape_a, shape_b):
    a = list(shape_a)
    b = list(shape_b)

    width = max(len(a), len(b))
    a = [1] * (width - len(a)) + a
    b = [1] * (width - len(b)) + b

    result = []
    for left, right in zip(a, b):
        if left == right:
            result.append(left)
        elif left == 1:
            result.append(right)
        elif right == 1:
            result.append(left)
        else:
            return None

    return tuple(result)
