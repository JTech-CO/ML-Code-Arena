import numpy as np

VARIANCE_FLOOR = 1e-9


def solve(train_x, train_y, queries, n_classes):
    n, p = train_x.shape

    log_prior = np.zeros(n_classes)
    mean = np.zeros((n_classes, p))
    variance = np.zeros((n_classes, p))

    for label in range(n_classes):
        members = train_x[train_y == label]
        count = members.shape[0]

        log_prior[label] = np.log(count / n)
        mean[label] = members.sum(axis=0) / count
        centered = members - mean[label]
        variance[label] = (centered * centered).sum(axis=0) / count + VARIANCE_FLOOR

    # (m, k, p) 로 펴서 특성 축을 더한다.
    difference = queries[:, None, :] - mean[None, :, :]
    log_likelihood = (
        -0.5 * np.log(2.0 * np.pi * variance)[None, :, :]
        - difference * difference / (2.0 * variance[None, :, :])
    ).sum(axis=2)

    return np.argmax(log_prior[None, :] + log_likelihood, axis=1)
