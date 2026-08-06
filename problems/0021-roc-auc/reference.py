import numpy as np


def _average_ranks(scores):
    """동점에 평균 순위를 준다. 순위는 1 부터 센다."""
    order = np.argsort(scores, kind="stable")
    sorted_scores = scores[order]

    ranks = np.empty(scores.shape[0], dtype=float)
    start = 0
    for index in range(1, scores.shape[0] + 1):
        if index == scores.shape[0] or sorted_scores[index] != sorted_scores[start]:
            # start .. index-1 이 동점 묶음이다. 1-기반 순위의 평균을 준다.
            ranks[order[start:index]] = (start + index + 1) / 2.0
            start = index

    return ranks


def solve(y_true, scores):
    # Mann-Whitney U 통계량으로 계산한다. 곡선을 그리지 않아도 같은 값이 나오고,
    # 동점 처리가 평균 순위 하나로 끝난다.
    ranks = _average_ranks(np.asarray(scores, dtype=float))

    positive = y_true == 1
    n_positive = positive.sum()
    n_negative = y_true.shape[0] - n_positive

    rank_sum = ranks[positive].sum()
    return float((rank_sum - n_positive * (n_positive + 1) / 2.0) / (n_positive * n_negative))
