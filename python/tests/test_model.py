import torch

from puyo_train.model import PolicyValueNet


def test_forward_shapes():
    net = PolicyValueNet()
    board = torch.zeros(4, 13, 6, 7)
    queue = torch.zeros(4, 16)
    policy, value = net(board, queue)
    assert policy.shape == (4, 22)
    assert value.shape == (4,)


def test_param_count_reasonable():
    net = PolicyValueNet()
    n = sum(p.numel() for p in net.parameters())
    assert 50_000 < n < 1_000_000, f"param count unexpected: {n}"


def test_loss_finite():
    net = PolicyValueNet()
    board = torch.zeros(2, 13, 6, 7)
    queue = torch.zeros(2, 16)
    action = torch.tensor([0, 5], dtype=torch.int64)
    value_target = torch.tensor([0.1, -0.2], dtype=torch.float32)
    policy, value = net(board, queue)
    loss_p = torch.nn.functional.cross_entropy(policy, action)
    loss_v = torch.nn.functional.mse_loss(value, value_target)
    loss = loss_p + loss_v
    assert torch.isfinite(loss)
    loss.backward()
    has_grad = any(
        p.grad is not None and torch.isfinite(p.grad).all() for p in net.parameters()
    )
    assert has_grad
