import torch

from puyo_train.model_v2 import PolicyValueNetV2


def test_forward_shapes():
    net = PolicyValueNetV2()
    board = torch.zeros(4, 13, 6, 7)
    queue = torch.zeros(4, 16)
    policy, value = net(board, queue)
    assert policy.shape == (4, 22)
    assert value.shape == (4,)


def test_param_count_around_1m():
    net = PolicyValueNetV2()
    n = sum(p.numel() for p in net.parameters())
    assert 700_000 < n < 1_500_000, f"param count unexpected: {n}"


def test_loss_finite_and_grad():
    net = PolicyValueNetV2()
    board = torch.zeros(2, 13, 6, 7)
    queue = torch.zeros(2, 16)
    policy_target = torch.zeros(2, 22)
    policy_target[:, 5] = 1.0
    value_target = torch.tensor([0.1, -0.2])
    p, v = net(board, queue)
    log_p = torch.log_softmax(p, dim=1)
    loss_p = -(policy_target * log_p).sum(dim=1).mean()
    loss_v = torch.nn.functional.mse_loss(v, value_target)
    loss = loss_p + loss_v
    assert torch.isfinite(loss)
    loss.backward()
    has_grad = any(
        pp.grad is not None and torch.isfinite(pp.grad).all() for pp in net.parameters()
    )
    assert has_grad
