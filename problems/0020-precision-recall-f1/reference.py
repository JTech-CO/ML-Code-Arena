def solve(y_true, y_pred):
    true_positive = ((y_true == 1) & (y_pred == 1)).sum()
    predicted_positive = (y_pred == 1).sum()
    actual_positive = (y_true == 1).sum()

    precision = float(true_positive / predicted_positive) if predicted_positive > 0 else 0.0
    recall = float(true_positive / actual_positive) if actual_positive > 0 else 0.0

    total = precision + recall
    f1 = 2.0 * precision * recall / total if total > 0 else 0.0

    return (precision, recall, float(f1))
